import {
    finalizeSchemaSnapshot,
    schemaDialectFamily,
    type SchemaConstraint,
    type SchemaSnapshot,
    type SchemaSnapshotInput,
    type SchemaTable,
    type SchemaView,
} from '@dory/schema-compare';

import type { ConnectionMetadataAPI, DatabaseObjectRow, DriverConfig, SchemaGraphResult } from '../types';

type SettledValue<T> = {
    available: boolean;
    value: T;
};

async function settle<T>(operation: (() => Promise<T>) | undefined, fallback: T): Promise<SettledValue<T>> {
    if (!operation) return { available: false, value: fallback };
    try {
        return { available: true, value: await operation() };
    } catch {
        return { available: false, value: fallback };
    }
}

function objectKey(schema: string | null | undefined, name: string) {
    return `${schema?.trim() ?? ''}\u0000${name.trim()}`;
}

function inScope(schema: string | null | undefined, schemas: string[]) {
    return schemas.length === 0 || (schema != null && schemas.includes(schema));
}

function collectConstraints(graph: SchemaGraphResult, tableId: string, tableName: string): SchemaConstraint[] {
    const table = graph.tables.find(candidate => candidate.id === tableId);
    if (!table) return [];

    const constraints: SchemaConstraint[] = [];
    const primaryColumns = table.columns.filter(column => column.isPrimaryKey).map(column => column.name);
    if (primaryColumns.length > 0) {
        constraints.push({
            name: `${tableName}_pkey`,
            kind: 'primary_key',
            columns: primaryColumns,
        });
    }

    for (const relationship of graph.relationships) {
        if (relationship.sourceTableId !== tableId) continue;
        const target = graph.tables.find(candidate => candidate.id === relationship.targetTableId);
        constraints.push({
            name: relationship.constraintName ?? `${tableName}_${relationship.sourceColumns.join('_')}_fkey`,
            kind: 'foreign_key',
            columns: relationship.sourceColumns,
            referencedSchema: target?.schema ?? null,
            referencedTable: target?.name ?? null,
            referencedColumns: relationship.targetColumns,
            onUpdate: relationship.onUpdate,
            onDelete: relationship.onDelete,
            enforced: graph.capabilities.constraintsEnforced,
        });
    }

    return constraints;
}

function collectViews(rows: DatabaseObjectRow[], kind: SchemaView['kind'], schemas: string[]): SchemaView[] {
    return rows
        .filter(row => inScope(row.schema, schemas))
        .map(row => ({
            schema: row.schema ?? null,
            name: row.name,
            kind,
            definition: null,
        }));
}

/**
 * Conservative set-based fallback used until a driver provides a richer
 * native snapshot. Missing capabilities remain explicit coverage gaps.
 */
export async function collectGenericSchemaSnapshot(config: DriverConfig, metadata: ConnectionMetadataAPI, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const family = schemaDialectFamily(config.type);
    if (!family) throw new Error(`Unsupported schema comparison driver: ${config.type}`);

    const schemas = [...new Set((input.schemas ?? []).map(schema => schema.trim()).filter(Boolean))].sort();
    const [graphResult, tablesResult, viewsResult, materializedViewsResult] = await Promise.all([
        settle(
            metadata.getSchemaGraph
                ? () =>
                      metadata.getSchemaGraph!({
                          database: input.database,
                          schemas,
                          columnMode: 'all',
                      })
                : undefined,
            null,
        ),
        settle(metadata.getTablesOnly ? () => metadata.getTablesOnly!(input.database) : undefined, []),
        settle(metadata.getViews ? () => metadata.getViews!(input.database) : undefined, []),
        settle(metadata.getMaterializedViews ? () => metadata.getMaterializedViews!(input.database) : undefined, []),
    ]);

    const graph = graphResult.value;
    const graphComplete = graphResult.available && graph?.status === 'ready';
    const statisticsByTable = new Map(tablesResult.value.filter(row => inScope(row.schema, schemas)).map(row => [objectKey(row.schema, row.name), row]));

    const tables: SchemaTable[] = (graph?.tables ?? [])
        .filter(table => table.scope === 'selected' && inScope(table.schema, schemas))
        .map(table => {
            const statistics = statisticsByTable.get(objectKey(table.schema, table.name));
            return {
                schema: table.schema,
                name: table.name,
                columns: table.columns.map(column => ({
                    name: column.name,
                    dataType: column.dataType,
                    nullable: column.nullable,
                    ordinal: column.ordinal,
                })),
                indexes: [],
                constraints: collectConstraints(graph!, table.id, table.name),
                statistics: statistics
                    ? {
                          estimatedRows: statistics.totalRows ?? null,
                          totalBytes: statistics.totalBytes ?? null,
                          source: 'catalog_estimate',
                      }
                    : null,
                attributes: {},
            };
        });

    const views = [...collectViews(viewsResult.value, 'view', schemas), ...collectViews(materializedViewsResult.value, 'materialized_view', schemas)];
    const warnings = [
        'Generic driver snapshot does not include column defaults, unique/check constraints, or index definitions.',
        'View names are captured, but definitions are unavailable from the generic metadata contract.',
    ];
    if (!graphComplete) {
        warnings.push(`Schema graph collection was ${graph?.status ?? 'unavailable'}; table and column coverage is incomplete.`);
    }

    return finalizeSchemaSnapshot({
        family,
        engine: config.type,
        database: input.database,
        schemas,
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: graphComplete ? 'complete' : graphResult.available ? 'partial' : 'unavailable',
            columns: graphComplete ? 'partial' : graphResult.available ? 'partial' : 'unavailable',
            indexes: family === 'snowflake' ? 'not_applicable' : 'unavailable',
            constraints: graphComplete ? 'partial' : graphResult.available ? 'partial' : 'unavailable',
            views: viewsResult.available && materializedViewsResult.available ? 'partial' : viewsResult.available ? 'partial' : 'unavailable',
            statistics: tablesResult.available ? 'partial' : 'unavailable',
        },
        tables,
        views,
        warnings,
    });
}
