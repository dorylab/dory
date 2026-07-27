import { getDoryArtifactStore, type ComparisonRunArtifactRef } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import type { Comparison, ComparisonConfigurationSnapshot, ComparisonEndpointConfiguration, ComparisonRun, ComparisonRunActorType } from '@dory/database/postgres/schemas';
import {
    compareSchemaSnapshots,
    DEFAULT_SCHEMA_COMPARISON_OBJECT_TYPES,
    getSchemaComparisonCapabilities,
    schemaChangesToResultRows,
    schemaDialectFamily,
    stableSchemaHash,
    type SchemaComparisonObjectType,
    type SchemaComparisonResult,
} from '@dory/schema-compare';

import { ensureConnectionPoolForUser } from '@/lib/connection/utils';

export type SchemaComparisonConfigurationInput = {
    name: string;
    source: ComparisonEndpointConfiguration;
    target: ComparisonEndpointConfiguration;
    schemaFilter?: string[];
    objectTypes?: SchemaComparisonObjectType[];
};

export type RunSchemaComparisonInput = {
    organizationId: string;
    userId: string;
    comparisonId: string;
    actorType?: ComparisonRunActorType;
    workId?: string | null;
};

export type RunSchemaComparisonOutput = {
    comparison: Awaited<ReturnType<DBService['comparisons']['get']>>;
    run: ComparisonRun;
    result: SchemaComparisonResult | null;
    topChanges: SchemaComparisonResult['changes'];
};

export type CreateComparisonOutput = RunSchemaComparisonOutput;

export type UpdateComparisonOutput = {
    comparison: Awaited<ReturnType<DBService['comparisons']['get']>>;
    run: ComparisonRun | null;
    result: SchemaComparisonResult | null;
    topChanges: SchemaComparisonResult['changes'];
    configurationChanged: boolean;
};

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
    return 'comparison_failed';
}

function normalizeConfiguration(input: SchemaComparisonConfigurationInput) {
    const name = input.name.trim();
    if (!name) throw new Error('Comparison name is required.');
    const schemaFilter = [...new Set((input.schemaFilter ?? []).map(schema => schema.trim()).filter(Boolean))].sort();
    if (input.objectTypes && !input.objectTypes.length) throw new Error('Select at least one schema object type to compare.');
    const requestedTypes = input.objectTypes ?? [];
    const objectTypes = DEFAULT_SCHEMA_COMPARISON_OBJECT_TYPES.filter(type => requestedTypes.includes(type));
    return {
        name,
        source: {
            connectionId: input.source.connectionId,
            identityId: input.source.identityId ?? null,
            database: input.source.database.trim(),
        },
        target: {
            connectionId: input.target.connectionId,
            identityId: input.target.identityId ?? null,
            database: input.target.database.trim(),
        },
        schemaFilter,
        objectTypes,
    };
}

async function validateConfiguration(db: DBService, organizationId: string, rawInput: SchemaComparisonConfigurationInput) {
    const input = normalizeConfiguration(rawInput);
    if (!input.source.connectionId || !input.target.connectionId || !input.source.database || !input.target.database) {
        throw new Error('Source and Target connections and databases are required.');
    }
    const [sourceRecord, targetRecord] = await Promise.all([
        db.connections.getById(organizationId, input.source.connectionId),
        db.connections.getById(organizationId, input.target.connectionId),
    ]);
    if (!sourceRecord || !targetRecord) throw new Error('One or both comparison connections were not found.');
    const sourceCapabilities = getSchemaComparisonCapabilities(sourceRecord.connection.type);
    const targetCapabilities = getSchemaComparisonCapabilities(targetRecord.connection.type);
    if (!sourceCapabilities.supported || !targetCapabilities.supported) {
        throw new Error('One or both connections do not support Schema Comparisons.');
    }
    const sourceFamily = schemaDialectFamily(sourceRecord.connection.type);
    const targetFamily = schemaDialectFamily(targetRecord.connection.type);
    if (!sourceFamily || !targetFamily || sourceFamily !== targetFamily) {
        throw new Error(`Schema Compare requires the same dialect family. Source is ${sourceRecord.connection.type}; Target is ${targetRecord.connection.type}.`);
    }
    if (rawInput.objectTypes == null) input.objectTypes = [...sourceCapabilities.objectTypes];
    if (!input.objectTypes.length) throw new Error('Select at least one schema object type to compare.');
    const unsupportedObjectTypes = input.objectTypes.filter(type => !sourceCapabilities.objectTypes.includes(type));
    if (unsupportedObjectTypes.length) {
        throw new Error(`Schema Compare does not support these objects for ${sourceRecord.connection.type}: ${unsupportedObjectTypes.join(', ')}.`);
    }
    if (!sourceCapabilities.supportsSchemaFilter) input.schemaFilter = [];
    return { ...input, dialectFamily: sourceFamily };
}

function snapshotFor(comparison: Comparison): ComparisonConfigurationSnapshot {
    return {
        version: 1,
        configurationVersion: comparison.configurationVersion,
        name: comparison.name,
        source: comparison.sourceEndpoint,
        target: comparison.targetEndpoint,
        schemaFilter: comparison.schemaFilter,
        objectTypes: comparison.objectTypes,
        dialectFamily: comparison.dialectFamily,
    };
}

function comparableConfiguration(comparison: Comparison) {
    return JSON.stringify({
        source: comparison.sourceEndpoint,
        target: comparison.targetEndpoint,
        schemaFilter: comparison.schemaFilter,
        objectTypes: comparison.objectTypes,
        dialectFamily: comparison.dialectFamily,
    });
}

export async function createComparisonAndRun(
    db: DBService,
    input: {
        organizationId: string;
        userId: string;
        actorType?: ComparisonRunActorType;
        workId?: string | null;
        configuration: SchemaComparisonConfigurationInput;
    },
): Promise<CreateComparisonOutput> {
    const validated = await validateConfiguration(db, input.organizationId, input.configuration);
    const comparison = await db.comparisons.createComparison({
        organizationId: input.organizationId,
        userId: input.userId,
        ...validated,
    });
    return runSchemaComparison(db, {
        organizationId: input.organizationId,
        userId: input.userId,
        comparisonId: comparison.id,
        actorType: input.actorType,
        workId: input.workId,
    });
}

export async function updateComparisonAndRun(
    db: DBService,
    input: {
        organizationId: string;
        userId: string;
        comparisonId: string;
        actorType?: ComparisonRunActorType;
        workId?: string | null;
        configuration: SchemaComparisonConfigurationInput;
    },
): Promise<UpdateComparisonOutput> {
    const existing = await db.comparisons.get(input.organizationId, input.comparisonId);
    if (existing.latestRun?.status === 'running') throw new Error('Wait for the active comparison run to finish before editing this Comparison.');
    const validated = await validateConfiguration(db, input.organizationId, input.configuration);
    const nextConfiguration = JSON.stringify({
        source: validated.source,
        target: validated.target,
        schemaFilter: validated.schemaFilter,
        objectTypes: validated.objectTypes,
        dialectFamily: validated.dialectFamily,
    });
    const configurationChanged = comparableConfiguration(existing) !== nextConfiguration;
    await db.comparisons.updateComparison({
        organizationId: input.organizationId,
        comparisonId: input.comparisonId,
        name: validated.name,
        source: validated.source,
        target: validated.target,
        schemaFilter: validated.schemaFilter,
        objectTypes: validated.objectTypes,
        dialectFamily: validated.dialectFamily,
        configurationVersion: existing.configurationVersion + (configurationChanged ? 1 : 0),
    });
    if (!configurationChanged) {
        return {
            comparison: await db.comparisons.get(input.organizationId, input.comparisonId),
            run: null,
            result: null,
            topChanges: [],
            configurationChanged: false,
        };
    }
    const output = await runSchemaComparison(db, {
        organizationId: input.organizationId,
        userId: input.userId,
        comparisonId: input.comparisonId,
        actorType: input.actorType,
        workId: input.workId,
    });
    return { ...output, configurationChanged: true };
}

export async function runSchemaComparison(db: DBService, input: RunSchemaComparisonInput): Promise<RunSchemaComparisonOutput> {
    await db.comparisons.markStaleRunningFailed(input.organizationId, new Date(Date.now() - 15 * 60 * 1000)).catch(() => undefined);
    if (input.workId) {
        const work = await db.works.getById({
            organizationId: input.organizationId,
            userId: input.userId,
            workId: input.workId,
        });
        if (!work) throw new Error('Agent Run not found in this organization.');
    }
    const comparisonRecord = await db.comparisons.get(input.organizationId, input.comparisonId);
    if (comparisonRecord.latestRun?.status === 'running') throw new Error('A comparison run is already in progress.');

    const configurationSnapshot = snapshotFor(comparisonRecord);
    const run = await db.comparisons.createRun({
        organizationId: input.organizationId,
        comparisonId: comparisonRecord.id,
        userId: input.userId,
        actorType: input.actorType ?? 'user',
        workId: input.workId,
        configurationSnapshot,
    });
    let artifactRef: ComparisonRunArtifactRef | null = null;
    let resultSetId: string | null = null;

    try {
        const [sourcePool, targetPool] = await Promise.all([
            ensureConnectionPoolForUser(input.userId, input.organizationId, configurationSnapshot.source.connectionId, configurationSnapshot.source.identityId ?? null),
            ensureConnectionPoolForUser(input.userId, input.organizationId, configurationSnapshot.target.connectionId, configurationSnapshot.target.identityId ?? null),
        ]);
        const [sourceSnapshot, targetSnapshot] = await Promise.all([
            sourcePool.entry.instance.getSchemaSnapshot({
                database: configurationSnapshot.source.database,
                schemas: configurationSnapshot.schemaFilter.length ? configurationSnapshot.schemaFilter : undefined,
            }),
            targetPool.entry.instance.getSchemaSnapshot({
                database: configurationSnapshot.target.database,
                schemas: configurationSnapshot.schemaFilter.length ? configurationSnapshot.schemaFilter : undefined,
            }),
        ]);
        const result = compareSchemaSnapshots(sourceSnapshot, targetSnapshot, {
            objectTypes: configurationSnapshot.objectTypes,
        });
        artifactRef = await getDoryArtifactStore().comparisons.putRun({
            organizationId: input.organizationId,
            comparisonId: comparisonRecord.id,
            runId: run.id,
            configuration: configurationSnapshot,
            source: sourceSnapshot,
            target: targetSnapshot,
            comparison: result,
        });
        const persisted = await db.resultSets.persistDerivedResultSet({
            organizationId: input.organizationId,
            userId: input.userId,
            comparisonId: comparisonRecord.id,
            comparisonRunId: run.id,
            rows: schemaChangesToResultRows(result.changes),
            kind: 'schema-diff',
            workId: input.workId,
            agentRunId: input.workId,
            sourceConnectionType: comparisonRecord.dialectFamily,
            sourceDatabaseName: `${configurationSnapshot.source.database} → ${configurationSnapshot.target.database}`,
            contentHash: stableSchemaHash(result),
            persistent: true,
        });
        resultSetId = persisted.resultSetId;
        const completed = await db.comparisons.completeRun({
            organizationId: input.organizationId,
            comparisonId: comparisonRecord.id,
            runId: run.id,
            comparison: result,
            artifactRef,
            resultSetId,
        });
        return {
            comparison: await db.comparisons.get(input.organizationId, comparisonRecord.id),
            run: completed,
            result,
            topChanges: result.changes.slice(0, 20),
        };
    } catch (error) {
        if (resultSetId) {
            await db.resultSets.deleteResultSet({ organizationId: input.organizationId, resultSetId }).catch(() => undefined);
        }
        if (artifactRef) {
            await getDoryArtifactStore()
                .comparisons.deleteRun(artifactRef)
                .catch(() => undefined);
        }
        const failed = await db.comparisons.failRun({
            organizationId: input.organizationId,
            comparisonId: comparisonRecord.id,
            runId: run.id,
            code: errorCode(error),
            message: errorMessage(error),
        });
        return {
            comparison: await db.comparisons.get(input.organizationId, comparisonRecord.id),
            run: failed,
            result: null,
            topChanges: [],
        };
    }
}
