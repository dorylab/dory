import { createHash } from 'node:crypto';

import Ajv2020 from 'ajv/dist/2020.js';
import { parseDocument, stringify } from 'yaml';

import {
    OSSIE_VERSION,
    type KnowledgeDefinition,
    type KnowledgeModelDocument,
    type OssieAiContext,
    type OssieCustomExtension,
    type OssieDataset,
    type OssieDialect,
    type OssieDocumentV011,
    type OssieExpression,
    type OssieField,
    type OssieMetric,
    type OssieRelationship,
} from '@dory/database/postgres/schemas';
import ossieSchema from './ossie-0.1.1.schema.json' with { type: 'json' };

type DoryExtension = {
    dory?: {
        id?: string;
        kind?: KnowledgeDefinition['kind'];
        status?: KnowledgeDefinition['status'];
        sourceConnectionId?: string;
        filters?: string[];
        dimensions?: string[];
    };
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(ossieSchema);

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function slug(value: string) {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'item'
    );
}

function aiContext(value: OssieAiContext | undefined) {
    if (typeof value === 'string') return { instructions: value };
    return value ?? {};
}

function extensionData(extensions?: OssieCustomExtension[]): DoryExtension['dory'] {
    for (const extension of extensions ?? []) {
        if (extension.vendor_name !== 'COMMON') continue;
        try {
            const parsed = JSON.parse(extension.data) as DoryExtension;
            if (parsed?.dory) return parsed.dory;
        } catch {
            // Other tools may place opaque COMMON data here. Preserve it and ignore it.
        }
    }
    return undefined;
}

function withDoryExtension(extensions: OssieCustomExtension[] | undefined, dory: NonNullable<DoryExtension['dory']>) {
    const next = (extensions ?? []).filter(extension => {
        if (extension.vendor_name !== 'COMMON') return true;
        try {
            return !(JSON.parse(extension.data) as DoryExtension)?.dory;
        } catch {
            return true;
        }
    });
    return [...next, { vendor_name: 'COMMON' as const, data: JSON.stringify({ dory }) }];
}

function expressionFor(expression: OssieExpression, preferred: OssieDialect = 'ANSI_SQL') {
    return (
        expression.dialects.find(item => item.dialect === preferred)?.expression ??
        expression.dialects.find(item => item.dialect === 'ANSI_SQL')?.expression ??
        expression.dialects[0]?.expression
    );
}

function expression(value: string, dialect: OssieDialect = 'ANSI_SQL'): OssieExpression {
    return { dialects: [{ dialect, expression: value }] };
}

function assertUnique(values: string[], label: string) {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
        seen.add(value);
    }
}

export function validateOssieDocument(value: unknown): OssieDocumentV011 {
    if ((value as { cubes?: unknown })?.cubes) throw new Error('Cube YAML is no longer supported. Import an Apache Ossie 0.1.1 document.');
    if (!validateSchema(value)) {
        const issue = validateSchema.errors?.[0];
        throw new Error(`Invalid Apache Ossie 0.1.1 document${issue ? ` at ${issue.instancePath || '/'}: ${issue.message}` : '.'}`);
    }
    const document = value as OssieDocumentV011;
    if (document.version !== OSSIE_VERSION) throw new Error(`Only Apache Ossie ${OSSIE_VERSION} is supported.`);
    if (document.semantic_model.length !== 1) throw new Error('Dory requires exactly one semantic_model per Ossie document.');
    const model = document.semantic_model[0];
    assertUnique(
        model.datasets.map(item => item.name),
        'dataset name',
    );
    assertUnique(model.metrics?.map(item => item.name) ?? [], 'metric name');
    assertUnique(model.relationships?.map(item => item.name) ?? [], 'relationship name');
    const datasets = new Map(model.datasets.map(item => [item.name, item]));
    for (const dataset of model.datasets) assertUnique(dataset.fields?.map(item => item.name) ?? [], `field name in ${dataset.name}`);
    for (const relationship of model.relationships ?? []) {
        if (!datasets.has(relationship.from) || !datasets.has(relationship.to)) throw new Error(`Relationship "${relationship.name}" references an unknown dataset.`);
        if (relationship.from_columns.length !== relationship.to_columns.length)
            throw new Error(`Relationship "${relationship.name}" must have matching from_columns and to_columns.`);
        const fromFields = new Set(datasets.get(relationship.from)?.fields?.map(item => item.name) ?? []);
        const toFields = new Set(datasets.get(relationship.to)?.fields?.map(item => item.name) ?? []);
        if (relationship.from_columns.some(column => !fromFields.has(column)) || relationship.to_columns.some(column => !toFields.has(column))) {
            throw new Error(`Relationship "${relationship.name}" references an unknown field.`);
        }
    }
    return document;
}

export function parseOssieYaml(source: string) {
    const parsed = parseDocument(source);
    if (parsed.errors.length) throw new Error(parsed.errors[0]?.message ?? 'Invalid YAML.');
    return validateOssieDocument(parsed.toJS());
}

export function serializeOssieDocument(document: OssieDocumentV011) {
    return stringify(validateOssieDocument(document), { lineWidth: 0 });
}

export function ossieRevision(document: OssieDocumentV011) {
    return createHash('sha256')
        .update(JSON.stringify(stable(validateOssieDocument(document))))
        .digest('hex');
}

export function ossieBusinessContext(document: OssieDocumentV011) {
    return aiContext(document.semantic_model[0].ai_context).instructions ?? '';
}

function definitionFromDataset(dataset: OssieDataset, fallbackSourceConnectionId?: string): KnowledgeDefinition {
    const dory = extensionData(dataset.custom_extensions);
    const context = aiContext(dataset.ai_context);
    return {
        id: dory?.id ?? `entity:${slug(dataset.name)}`,
        name: dataset.name,
        kind: 'entity',
        status: dory?.status ?? 'unverified',
        sourceConnectionId: dory?.sourceConnectionId ?? fallbackSourceConnectionId ?? '',
        source: dataset.source,
        description: dataset.description,
        aliases: context.synonyms,
        aiContext: dataset.ai_context,
    };
}

function definitionFromField(dataset: OssieDataset, field: OssieField, fallbackSourceConnectionId?: string): KnowledgeDefinition {
    const datasetDory = extensionData(dataset.custom_extensions);
    const dory = extensionData(field.custom_extensions);
    const context = aiContext(field.ai_context);
    return {
        id: dory?.id ?? `dimension:${slug(dataset.name)}:${slug(field.name)}`,
        name: field.name,
        kind: 'dimension',
        status: dory?.status ?? 'unverified',
        sourceConnectionId: dory?.sourceConnectionId ?? datasetDory?.sourceConnectionId ?? fallbackSourceConnectionId ?? '',
        source: dataset.source,
        expression: expressionFor(field.expression),
        description: field.description,
        aliases: context.synonyms,
        timeDimension: field.dimension?.is_time ? field.name : undefined,
        aiContext: field.ai_context,
        dialect: field.expression.dialects[0]?.dialect,
    };
}

function referencedDataset(expressionValue: string, datasets: OssieDataset[]) {
    return datasets.find(dataset => expressionValue.includes(`${dataset.name}.`)) ?? datasets[0];
}

export function projectOssieDocument(document: OssieDocumentV011, fallbackSourceConnectionId?: string): KnowledgeModelDocument {
    const model = document.semantic_model[0];
    const entities = model.datasets.map(dataset => definitionFromDataset(dataset, fallbackSourceConnectionId));
    const fields = model.datasets.flatMap(dataset => (dataset.fields ?? []).map(field => definitionFromField(dataset, field, fallbackSourceConnectionId)));
    const metrics = (model.metrics ?? []).map(metric => {
        const expressionValue = expressionFor(metric.expression) ?? '';
        const dataset = referencedDataset(expressionValue, model.datasets);
        const dory = extensionData(metric.custom_extensions);
        const datasetDory = extensionData(dataset?.custom_extensions);
        const context = aiContext(metric.ai_context);
        return {
            id: dory?.id ?? `metric:${slug(metric.name)}`,
            name: metric.name,
            kind: dory?.kind === 'measure' ? ('measure' as const) : ('metric' as const),
            status: dory?.status ?? ('unverified' as const),
            sourceConnectionId: dory?.sourceConnectionId ?? datasetDory?.sourceConnectionId ?? fallbackSourceConnectionId ?? '',
            source: dataset?.source,
            expression: expressionValue,
            description: metric.description,
            aliases: context.synonyms,
            filters: dory?.filters,
            dimensions: dory?.dimensions,
            aiContext: metric.ai_context,
            dialect: metric.expression.dialects[0]?.dialect,
        };
    });
    const relationships = (model.relationships ?? []).map(relationship => {
        const dory = extensionData(relationship.custom_extensions);
        const datasetDory = extensionData(model.datasets.find(dataset => dataset.name === relationship.from)?.custom_extensions);
        const context = aiContext(relationship.ai_context);
        return {
            id: dory?.id ?? `relationship:${slug(relationship.name)}`,
            name: relationship.name,
            kind: 'relationship' as const,
            status: dory?.status ?? ('unverified' as const),
            sourceConnectionId: dory?.sourceConnectionId ?? datasetDory?.sourceConnectionId ?? fallbackSourceConnectionId ?? '',
            description: undefined,
            aliases: context.synonyms,
            from: relationship.from,
            to: relationship.to,
            fromColumns: relationship.from_columns,
            toColumns: relationship.to_columns,
            aiContext: relationship.ai_context,
        };
    });
    return { definitions: [...entities, ...fields, ...metrics, ...relationships] };
}

function createModel(name: string, description: string | null | undefined, connectionId: string): OssieDocumentV011 {
    const modelName = slug(name);
    const datasetName = `${modelName}_dataset`;
    return {
        version: OSSIE_VERSION,
        semantic_model: [
            {
                name: modelName,
                ...(description ? { description } : {}),
                datasets: [
                    {
                        name: datasetName,
                        source: '__unconfigured__',
                        custom_extensions: withDoryExtension(undefined, {
                            id: `entity:${datasetName}`,
                            kind: 'entity',
                            status: 'unverified',
                            sourceConnectionId: connectionId,
                        }),
                    },
                ],
                relationships: [],
                metrics: [],
            },
        ],
    };
}

export function createOssieDocument(name: string, description: string | null | undefined, connectionId: string) {
    return createModel(name, description, connectionId);
}

export function updateOssieMetadata(
    document: OssieDocumentV011,
    patch: {
        name?: string;
        description?: string | null;
        businessContextMd?: string;
        aiContext?: { instructions?: string; synonyms?: string[]; examples?: string[] };
    },
) {
    const model = document.semantic_model[0];
    const currentContext = aiContext(model.ai_context);
    return validateOssieDocument({
        ...document,
        semantic_model: [
            {
                ...model,
                ...(patch.name !== undefined ? { name: slug(patch.name) } : {}),
                ...(patch.description !== undefined ? { description: patch.description || undefined } : {}),
                ...(patch.businessContextMd !== undefined || patch.aiContext !== undefined
                    ? {
                          ai_context: {
                              ...currentContext,
                              ...(patch.aiContext ?? {}),
                              ...(patch.businessContextMd !== undefined ? { instructions: patch.businessContextMd || undefined } : {}),
                          },
                      }
                    : {}),
            },
        ],
    });
}

function mergeExpression(current: OssieExpression | undefined, definition: KnowledgeDefinition) {
    const dialect = definition.dialect ?? 'ANSI_SQL';
    const others = (current?.dialects ?? []).filter(item => item.dialect !== dialect);
    return { dialects: [...others, { dialect, expression: definition.expression || definition.name }] };
}

export function applyKnowledgeDefinitions(document: OssieDocumentV011, definitions: KnowledgeDefinition[]) {
    const current = document.semantic_model[0];
    const entities = definitions.filter(item => item.kind === 'entity');
    const datasets = entities.map(entity => {
        const existing = current.datasets.find(dataset => extensionData(dataset.custom_extensions)?.id === entity.id || dataset.name === entity.name);
        const context = aiContext(existing?.ai_context);
        const fields = definitions
            .filter(item => item.kind === 'dimension' && (item.source === entity.source || (!item.source && item.sourceConnectionId === entity.sourceConnectionId)))
            .map(item => {
                const existingField = existing?.fields?.find(field => extensionData(field.custom_extensions)?.id === item.id || field.name === item.name);
                return {
                    ...existingField,
                    name: item.name,
                    expression: mergeExpression(existingField?.expression, item),
                    ...(item.description ? { description: item.description } : {}),
                    ...(item.timeDimension ? { dimension: { ...(existingField?.dimension ?? {}), is_time: true } } : {}),
                    ...(item.aiContext || item.aliases ? { ai_context: item.aiContext ?? { ...aiContext(existingField?.ai_context), synonyms: item.aliases } } : {}),
                    custom_extensions: withDoryExtension(existingField?.custom_extensions, {
                        id: item.id,
                        kind: item.kind,
                        status: item.status,
                        sourceConnectionId: item.sourceConnectionId,
                    }),
                } satisfies OssieField;
            });
        return {
            ...existing,
            name: entity.name,
            source: entity.source || existing?.source || '__unconfigured__',
            ...(entity.description ? { description: entity.description } : {}),
            ...(entity.aiContext || entity.aliases ? { ai_context: entity.aiContext ?? { ...context, synonyms: entity.aliases } } : {}),
            fields,
            custom_extensions: withDoryExtension(existing?.custom_extensions, {
                id: entity.id,
                kind: entity.kind,
                status: entity.status,
                sourceConnectionId: entity.sourceConnectionId,
            }),
        } satisfies OssieDataset;
    });
    const metrics = definitions
        .filter(item => item.kind === 'metric' || item.kind === 'measure')
        .map(item => {
            const existing = current.metrics?.find(metric => extensionData(metric.custom_extensions)?.id === item.id || metric.name === item.name);
            return {
                ...existing,
                name: item.name,
                expression: mergeExpression(existing?.expression, item),
                ...(item.description ? { description: item.description } : {}),
                ...(item.aiContext || item.aliases ? { ai_context: item.aiContext ?? { ...aiContext(existing?.ai_context), synonyms: item.aliases } } : {}),
                custom_extensions: withDoryExtension(existing?.custom_extensions, {
                    id: item.id,
                    kind: item.kind,
                    status: item.status,
                    sourceConnectionId: item.sourceConnectionId,
                    filters: item.filters,
                    dimensions: item.dimensions,
                }),
            } satisfies OssieMetric;
        });
    const relationships = definitions
        .filter(item => item.kind === 'relationship')
        .map(item => {
            const existing = current.relationships?.find(value => extensionData(value.custom_extensions)?.id === item.id || value.name === item.name);
            return {
                ...existing,
                name: item.name,
                from: item.from ?? '',
                to: item.to ?? '',
                from_columns: item.fromColumns ?? [],
                to_columns: item.toColumns ?? [],
                ...(item.aiContext || item.aliases ? { ai_context: item.aiContext ?? { ...aiContext(existing?.ai_context), synonyms: item.aliases } } : {}),
                custom_extensions: withDoryExtension(existing?.custom_extensions, {
                    id: item.id,
                    kind: item.kind,
                    status: item.status,
                    sourceConnectionId: item.sourceConnectionId,
                }),
            } satisfies OssieRelationship;
        });
    const next = { ...document, semantic_model: [{ ...current, datasets, metrics, relationships }] } as OssieDocumentV011;
    return validateOssieDocument(next);
}

export function markOssieDefinitionsUnverified(document: OssieDocumentV011, fallbackSourceConnectionId?: string) {
    const definitions = projectOssieDocument(document, fallbackSourceConnectionId).definitions.map(item => ({ ...item, status: 'unverified' as const }));
    return applyKnowledgeDefinitions(document, definitions);
}

export function sourceConnectionIds(document: OssieDocumentV011) {
    return [
        ...new Set(
            projectOssieDocument(document)
                .definitions.map(item => item.sourceConnectionId)
                .filter(Boolean),
        ),
    ];
}
