import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OSSIE_DATA_TYPES, OSSIE_DIALECTS, OSSIE_VERSION } from '@dory/shared/types/ossie';

import {
    getKnowledgeReadiness,
    KNOWLEDGE_SOURCE_MAX_BYTES,
    parseKnowledgeSourceYaml,
    parseKnowledgeYaml,
    serializeKnowledgeModel,
    validateKnowledgeModelDocument,
    validateKnowledgeSource,
} from '../../src/postgres/impl/knowledge/index';
import {
    applyKnowledgeDefinitions,
    createOssieDocument,
    ossieRevision,
    parseOssieYaml,
    projectOssieDocument,
    serializeOssieDocument,
    updateOssieMetadata,
    validateOssieDocument,
} from '../../src/postgres/impl/knowledge/ossie';
import type { OssieDocument } from '../../src/postgres/schemas/knowledge';

const sources = new Set(['postgres', 'clickhouse']);
const ossieDocument = {
    version: '0.2.0.dev0' as const,
    name: 'commerce',
    ai_context: { instructions: 'Revenue excludes tax.', synonyms: ['sales'], examples: ['Show revenue by customer.'] },
    datasets: [
        {
            name: 'orders',
            source: 'public.orders',
            fields: [
                { name: 'customer_id', expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'customer_id' }] } },
                {
                    name: 'amount',
                    expression: {
                        dialects: [
                            { dialect: 'ANSI_SQL' as const, expression: 'amount' },
                            { dialect: 'SNOWFLAKE' as const, expression: '"AMOUNT"' },
                        ],
                    },
                },
            ],
            custom_extensions: [{ vendor_name: 'COMMON' as const, data: JSON.stringify({ dory: { id: 'entity:orders', status: 'verified', sourceConnectionId: 'postgres' } }) }],
        },
        {
            name: 'customers',
            source: 'public.customers',
            fields: [{ name: 'id', expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'id' }] } }],
            custom_extensions: [{ vendor_name: 'COMMON' as const, data: JSON.stringify({ dory: { id: 'entity:customers', status: 'verified', sourceConnectionId: 'postgres' } }) }],
        },
    ],
    metrics: [
        {
            name: 'revenue',
            expression: {
                dialects: [
                    { dialect: 'ANSI_SQL' as const, expression: 'SUM(orders.amount)' },
                    { dialect: 'SNOWFLAKE' as const, expression: 'SUM(orders."AMOUNT")' },
                ],
            },
            ai_context: { synonyms: ['sales'], examples: ['Revenue by month'] },
            custom_extensions: [
                { vendor_name: 'COMMON' as const, data: JSON.stringify({ dory: { id: 'metric:revenue', status: 'verified', sourceConnectionId: 'postgres' } }) },
                { vendor_name: 'SNOWFLAKE' as const, data: JSON.stringify({ warehouse: 'ANALYTICS' }) },
            ],
        },
    ],
    relationships: [
        {
            name: 'order_customer',
            from: 'orders',
            to: 'customers',
            from_columns: ['customer_id'],
            to_columns: ['id'],
            custom_extensions: [
                {
                    vendor_name: 'COMMON' as const,
                    data: JSON.stringify({ dory: { id: 'relationship:order_customer', status: 'verified', sourceConnectionId: 'postgres' } }),
                },
            ],
        },
    ],
};

test('knowledge readiness requires connected data and a verified non-relationship definition', () => {
    const verifiedMetric = { id: 'metric:revenue', name: 'Revenue', kind: 'metric' as const, status: 'verified' as const, sourceConnectionId: 'postgres' };
    assert.equal(getKnowledgeReadiness([verifiedMetric], 1).status, 'ready');
    assert.equal(getKnowledgeReadiness([verifiedMetric], 0).status, 'not_ready');
    assert.equal(getKnowledgeReadiness([{ ...verifiedMetric, status: 'unverified' }], 1).status, 'not_ready');
});

test('new and legacy internal datasets stay out of public definitions without changing stored documents', () => {
    const document = createOssieDocument('电商', null, 'postgres');
    assert.equal(document.datasets[0].name, 'item_dataset');
    const legacy = structuredClone(document);
    legacy.datasets[0].custom_extensions![0].data = JSON.stringify({
        dory: { id: 'entity:item_dataset', kind: 'entity', status: 'unverified', sourceConnectionId: 'postgres' },
    });
    for (const source of [document, legacy, updateOssieMetadata(legacy, { name: 'Renamed' })]) {
        const before = structuredClone(source);
        assert.deepEqual(projectOssieDocument(source).definitions, []);
        assert.deepEqual(source, before);
        assert.deepEqual(parseKnowledgeYaml(serializeOssieDocument(source)).definitions, []);
        assert.doesNotThrow(() => validateOssieDocument(source));
    }
});

test('metrics-only and empty models save with an internal dataset and stable metric IDs', () => {
    const document = createOssieDocument('电商', null, 'postgres');
    const metric = {
        id: 'metric:net-revenue',
        name: '净收入',
        kind: 'metric' as const,
        status: 'verified' as const,
        sourceConnectionId: 'postgres',
        expression: 'SUM(orders.net_amount)',
    };
    const saved = applyKnowledgeDefinitions(document, [metric]);
    const definitions = projectOssieDocument(saved).definitions;
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].id, metric.id);
    assert.equal(definitions[0].expression, metric.expression);
    assert.equal(definitions[0].source, undefined);
    const edited = applyKnowledgeDefinitions(saved, [{ ...definitions[0], description: 'Exclude failed orders.' }]);
    assert.equal(projectOssieDocument(edited).definitions[0].id, metric.id);
    assert.equal(projectOssieDocument(edited).definitions[0].description, 'Exclude failed orders.');
    assert.deepEqual(projectOssieDocument(applyKnowledgeDefinitions(edited, [])).definitions, []);
    assert.equal(parseOssieYaml(serializeOssieDocument(edited)).metrics?.[0].name, metric.name);
});

test('real datasets remain visible, replace the skeleton and can be removed without invalidating Ossie', () => {
    const document = createOssieDocument('电商', null, 'postgres');
    const entity = {
        id: 'entity:item_dataset',
        name: 'item_dataset',
        kind: 'entity' as const,
        status: 'unverified' as const,
        sourceConnectionId: 'postgres',
        source: 'public.items',
    };
    const saved = applyKnowledgeDefinitions(document, [entity]);
    assert.equal(saved.datasets.length, 1);
    assert.equal(projectOssieDocument(saved).definitions[0].source, entity.source);
    // Explicitly created entities are public even before a source is configured.
    const unconfigured = applyKnowledgeDefinitions(document, [{ ...entity, source: '__unconfigured__' }]);
    assert.equal(projectOssieDocument(unconfigured).definitions[0].id, entity.id);
    assert.deepEqual(projectOssieDocument(applyKnowledgeDefinitions(saved, [])).definitions, []);
    // Existing skeletons that have acquired user content must not be hidden.
    for (const patch of [
        { source: 'public.items' },
        { description: 'Items available for purchase.' },
        { ai_context: { instructions: 'Use this dataset for items.' } },
        { fields: [{ name: 'id', expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'id' }] } }] },
    ]) {
        const source = structuredClone(document);
        Object.assign(source.datasets[0], patch);
        assert.equal(projectOssieDocument(source).definitions[0].id, entity.id);
    }
});

test('Ossie YAML round-trips dialects, AI context and extensions with a formatting-independent revision', () => {
    const yaml = serializeOssieDocument(ossieDocument);
    const parsed = parseOssieYaml(yaml);
    assert.deepEqual(parsed, ossieDocument);
    assert.equal(ossieRevision(parsed), ossieRevision(parseOssieYaml(`\n${yaml}\n`)));
    assert.equal(parsed.metrics?.[0]?.expression.dialects.length, 2);
});

test('Ossie projection preserves source ownership and marks imports unverified', () => {
    const yaml = serializeOssieDocument(ossieDocument);
    const imported = parseKnowledgeYaml(yaml);
    assert.ok(imported.definitions.every(definition => definition.status === 'unverified'));
    assert.equal(imported.definitions.find(definition => definition.name === 'revenue')?.sourceConnectionId, 'postgres');
    assert.equal(parseKnowledgeYaml(yaml, undefined, false).definitions[0]?.status, 'verified');
    assert.equal(parseKnowledgeSourceYaml(yaml).verifiedQueries.length, 0);
});

test('UI projection serializes as Ossie 0.2.0.dev0', () => {
    const projected = parseKnowledgeYaml(serializeOssieDocument(ossieDocument), undefined, false);
    const serialized = parseOssieYaml(serializeKnowledgeModel(projected));
    assert.equal(serialized.version, '0.2.0.dev0');
    assert.equal('semantic_model' in serialized, false);
    assert.equal(serialized.relationships?.[0]?.from_columns[0], 'customer_id');
});

test('UI patch preserves hidden dialects, AI context and custom extensions', () => {
    const projected = projectOssieDocument(ossieDocument);
    const definitions = projected.definitions.map(definition =>
        definition.name === 'revenue' ? { ...definition, expression: 'SUM(orders.amount) FILTER (WHERE orders.amount > 0)' } : definition,
    );
    const patched = applyKnowledgeDefinitions(ossieDocument, definitions);
    const revenue = patched.metrics?.find(metric => metric.name === 'revenue');
    assert.equal(revenue?.expression.dialects.find(item => item.dialect === 'SNOWFLAKE')?.expression, 'SUM(orders."AMOUNT")');
    assert.deepEqual(revenue?.ai_context, ossieDocument.metrics[0].ai_context);
    assert.equal(
        revenue?.custom_extensions?.some(extension => extension.vendor_name === 'SNOWFLAKE'),
        true,
    );
});

test('the vendored official Schema and shared vocabularies stay pinned', () => {
    const content = readFileSync(new URL('../../src/postgres/impl/knowledge/ossie-0.2.0.dev0.schema.json', import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), 'e1a1d9ad1cf2b33bc6b05a0d0d3a91b213e7ca034828a0bb76766bdb2e0b5ce1');
    const schema = JSON.parse(content.toString());
    assert.equal(schema.properties.version.const, OSSIE_VERSION);
    assert.deepEqual(schema.$defs.Dialect.enum, [...OSSIE_DIALECTS]);
    assert.deepEqual(schema.$defs.DataType.enum, [...OSSIE_DATA_TYPES]);
});

test('new data types, dialects and arbitrary vendors survive UI and YAML round trips', () => {
    const source: OssieDocument = structuredClone(ossieDocument);
    source.datasets[0].fields!.push(
        ...OSSIE_DATA_TYPES.map(datatype => ({
            name: `typed_${datatype}`,
            datatype,
            expression: { dialects: [{ dialect: 'BIGQUERY' as const, expression: `typed_${datatype}` }] },
            custom_extensions: [{ vendor_name: 'ACME_ANALYTICS', data: '{"logicalType":"preserved"}' }],
        })),
    );
    const metric = source.metrics![0];
    metric.datatype = 'Decimal';
    metric.expression.dialects = OSSIE_DIALECTS.map(dialect => ({ dialect, expression: `${dialect}_expression` }));
    // A vendor dialect before ANSI must not be overwritten with ANSI SQL during projection.
    metric.expression.dialects.reverse();
    const projected = validateKnowledgeModelDocument(projectOssieDocument(source), sources);
    assert.equal(projected.definitions.find(item => item.name === 'revenue')?.dialect, 'ANSI_SQL');
    const patched = parseOssieYaml(serializeOssieDocument(applyKnowledgeDefinitions(source, projected.definitions)));
    assert.deepEqual(patched.metrics![0].expression, metric.expression);
    assert.equal(patched.metrics![0].datatype, 'Decimal');
    for (const datatype of OSSIE_DATA_TYPES) {
        const field = patched.datasets[0].fields!.find(item => item.name === `typed_${datatype}`)!;
        assert.equal(field.datatype, datatype);
        assert.equal(field.expression.dialects[0].dialect, 'BIGQUERY');
        assert.ok(field.custom_extensions!.some(item => item.vendor_name === 'ACME_ANALYTICS' && item.data === '{"logicalType":"preserved"}'));
    }
});

test('time dimensions infer temporal datatypes while explicit false takes precedence', () => {
    const source: OssieDocument = structuredClone(ossieDocument);
    source.datasets[0].fields!.push(
        { name: 'event_time', datatype: 'DateTimeTz', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'event_time' }] } },
        { name: 'audit_time', datatype: 'DateTime', dimension: { is_time: false }, expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'audit_time' }] } },
        { name: 'year', datatype: 'Integer', dimension: { is_time: true }, expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'year' }] } },
    );
    const projected = projectOssieDocument(source);
    assert.equal(projected.definitions.find(item => item.name === 'event_time')?.timeDimension, 'event_time');
    assert.equal(projected.definitions.find(item => item.name === 'audit_time')?.timeDimension, undefined);
    assert.equal(projected.definitions.find(item => item.name === 'year')?.timeDimension, 'year');
    const patched = applyKnowledgeDefinitions(source, projected.definitions);
    assert.equal(patched.datasets[0].fields!.find(item => item.name === 'event_time')?.dimension, undefined);
    assert.deepEqual(patched.datasets[0].fields!.find(item => item.name === 'audit_time')?.dimension, { is_time: false });
});

test('model AI context patch preserves unknown external keys', () => {
    const source = structuredClone(ossieDocument);
    source.ai_context = { ...source.ai_context, audience: 'finance' };
    const patched = updateOssieMetadata(source, { aiContext: { synonyms: ['bookings'], examples: [] } });
    assert.deepEqual(patched.ai_context, {
        instructions: 'Revenue excludes tax.',
        synonyms: ['bookings'],
        examples: [],
        audience: 'finance',
    });
});

test('Ossie validation rejects unsupported and structurally invalid documents', () => {
    assert.throws(() => parseOssieYaml('cubes: []\n'), /no longer supported/i);
    assert.throws(() => validateOssieDocument({ ...ossieDocument, version: '0.2.0' }), /0\.2\.0\.dev0/i);
    assert.throws(() => validateOssieDocument({ version: '0.2.0.dev0', semantic_model: [ossieDocument] }), /required|additional properties/i);
    assert.throws(() => validateOssieDocument({ ...ossieDocument, semantic_model: [ossieDocument] }), /additional properties/i);
    assert.throws(
        () => parseOssieYaml('version: 0.1.1\nsemantic_model:\n  - name: legacy\n    datasets:\n      - name: orders\n        source: public.orders\n'),
        /0\.2\.0\.dev0/i,
    );
    assert.throws(() => parseKnowledgeYaml('version: 0.1.1\nsemantic_model: []\n'), /0\.2\.0\.dev0/i);
    assert.throws(() => validateOssieDocument({ version: '0.2.0.dev0', name: 'empty', datasets: [] }), /at least 1 item|datasets/i);
    assert.throws(() => validateOssieDocument({ ...ossieDocument, datasets: [ossieDocument.datasets[0], ossieDocument.datasets[0]] }), /duplicate dataset/i);
    assert.throws(
        () =>
            validateOssieDocument({
                ...ossieDocument,
                relationships: [{ name: 'broken', from: 'orders', to: 'missing', from_columns: ['customer_id'], to_columns: ['id'] }],
            }),
        /unknown dataset/i,
    );
    assert.throws(
        () =>
            validateOssieDocument({
                ...ossieDocument,
                relationships: [{ name: 'broken', from: 'orders', to: 'customers', from_columns: ['customer_id', 'amount'], to_columns: ['id'] }],
            }),
        /matching from_columns and to_columns/i,
    );
});

test('knowledge validation rejects unlinked sources, unsafe filters and incomplete relationships', () => {
    assert.throws(() => validateKnowledgeModelDocument({ definitions: [{ id: 'metric:x', name: 'X', kind: 'metric', sourceConnectionId: 'unknown' }] }, sources), /not linked/i);
    assert.throws(
        () =>
            validateKnowledgeModelDocument(
                { definitions: [{ id: 'metric:x', name: 'X', kind: 'metric', sourceConnectionId: 'postgres', filters: ['paid = true; drop table orders'] }] },
                sources,
            ),
        /single expression/i,
    );
    assert.throws(
        () =>
            validateKnowledgeModelDocument(
                { definitions: [{ id: 'relationship:x', name: 'X', kind: 'relationship', sourceConnectionId: 'postgres', from: 'orders', to: 'customers' }] },
                sources,
            ),
        /column mappings/i,
    );
});

test('knowledge sources validate supported text formats, size and YAML syntax', () => {
    assert.equal(validateKnowledgeSource('rules.md', '# Revenue').format, 'markdown');
    assert.equal(validateKnowledgeSource('model.yml', serializeOssieDocument(ossieDocument)).format, 'yaml');
    assert.equal(validateKnowledgeSource('notes.txt', 'Fiscal year starts in February.').format, 'text');
    assert.throws(() => validateKnowledgeSource('rules.pdf', 'content'), /only Markdown, YAML, and TXT/i);
    assert.throws(() => validateKnowledgeSource('model.yaml', 'semantic_model: ['), /flow sequence|invalid YAML/i);
    assert.doesNotThrow(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES)));
    assert.throws(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES + 1)), /10 MB/i);
});

test('reviewed text metrics retain no executable mapping until a human supplies an expression', () => {
    const text = {
        id: 'metric:text',
        kind: 'metric' as const,
        name: 'Text revenue',
        status: 'verified' as const,
        sourceConnectionId: 'postgres',
        description: 'Revenue excludes failed orders.',
        aliases: [],
        aiContext: { descriptionOnly: true },
    };
    const textDocument = applyKnowledgeDefinitions(ossieDocument, [...projectOssieDocument(ossieDocument).definitions, text]);
    const projected = projectOssieDocument(textDocument).definitions.find(d => d.id === text.id)!;
    assert.equal(projected.expression, undefined);
    assert.equal(projected.source, undefined);
    assert.equal(typeof projected.aiContext === 'object' && projected.aiContext.descriptionOnly, true);
    const mapped = projectOssieDocument(
        applyKnowledgeDefinitions(
            textDocument,
            projectOssieDocument(textDocument).definitions.map(d => (d.id === text.id ? { ...d, source: 'orders', expression: 'SUM(amount)' } : d)),
        ),
    ).definitions.find(d => d.id === text.id)!;
    assert.equal(mapped.id, text.id);
    assert.equal(mapped.source, 'orders');
    assert.equal(mapped.expression, 'SUM(amount)');
    assert.equal(typeof mapped.aiContext === 'object' && mapped.aiContext.descriptionOnly, false);
});
