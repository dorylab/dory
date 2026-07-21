import type { SchemaGraphCapabilities, SchemaGraphColumn, SchemaGraphOptions, SchemaGraphRelationship, SchemaGraphResult, SchemaGraphTable } from '../types';

export const SCHEMA_GRAPH_MAX_TABLES = 200;
export const SCHEMA_GRAPH_MAX_RELATIONSHIPS = 500;

export type SchemaGraphTableInput = Omit<SchemaGraphTable, 'id' | 'scope' | 'kind'>;

export type SchemaGraphRelationshipInput = Omit<SchemaGraphRelationship, 'id' | 'sourceTableId' | 'targetTableId'> & {
    sourceSchema?: string | null;
    sourceTable: string;
    targetSchema?: string | null;
    targetTable: string;
};

export function schemaGraphTableId(database: string, schema: string | null | undefined, table: string) {
    return ['schema-graph', database, schema ?? '', table].map(segment => encodeURIComponent(segment)).join(':');
}

function tableKey(schema: string | null | undefined, table: string) {
    return `${schema ?? ''}\u0000${table}`;
}

function relationshipId(input: SchemaGraphRelationshipInput) {
    const identity = [
        input.constraintName ?? '',
        input.sourceSchema ?? '',
        input.sourceTable,
        input.sourceColumns.join(','),
        input.targetSchema ?? '',
        input.targetTable,
        input.targetColumns.join(','),
    ];
    return identity.map(segment => encodeURIComponent(segment)).join(':');
}

function normalizeColumns(columns: SchemaGraphColumn[]) {
    return columns
        .filter(column => column.name.trim())
        .map(column => ({ ...column, name: column.name.trim(), dataType: column.dataType?.trim() || null }))
        .sort((left, right) => left.ordinal - right.ordinal || left.name.localeCompare(right.name));
}

function emptyResult(status: SchemaGraphResult['status'], capabilities: SchemaGraphCapabilities, totalTables = 0, totalRelationships = 0): SchemaGraphResult {
    return {
        status,
        tables: [],
        relationships: [],
        totalTables,
        totalRelationships,
        limits: {
            maxTables: SCHEMA_GRAPH_MAX_TABLES,
            maxRelationships: SCHEMA_GRAPH_MAX_RELATIONSHIPS,
        },
        capabilities,
    };
}

export function buildSchemaGraphResult(
    options: SchemaGraphOptions,
    tableInputs: SchemaGraphTableInput[],
    relationshipInputs: SchemaGraphRelationshipInput[],
    capabilities: SchemaGraphCapabilities,
): SchemaGraphResult {
    const tablesByKey = new Map<string, SchemaGraphTableInput>();
    for (const table of tableInputs) {
        const name = table.name.trim();
        const schema = table.schema?.trim() || null;
        if (!name) continue;
        tablesByKey.set(tableKey(schema, name), {
            ...table,
            database: table.database || options.database,
            schema,
            name,
            columns: normalizeColumns(table.columns),
        });
    }

    const relationships = relationshipInputs.filter(relationship => {
        return tablesByKey.has(tableKey(relationship.sourceSchema, relationship.sourceTable)) && tablesByKey.has(tableKey(relationship.targetSchema, relationship.targetTable));
    });
    const foreignKeyColumns = new Map<string, Set<string>>();
    for (const relationship of relationships) {
        const sourceKey = tableKey(relationship.sourceSchema, relationship.sourceTable);
        const sourceColumns = foreignKeyColumns.get(sourceKey) ?? new Set<string>();
        relationship.sourceColumns.forEach(column => sourceColumns.add(column));
        foreignKeyColumns.set(sourceKey, sourceColumns);
    }

    const requestedSchemas = new Set((options.schemas ?? []).map(schema => schema.trim()).filter(Boolean));
    const focusedKeys = new Set((options.focusTables ?? []).map(table => tableKey(table.schema, table.name)));
    let selectedKeys = new Set<string>();
    if (focusedKeys.size > 0) {
        selectedKeys = new Set(Array.from(focusedKeys).filter(key => tablesByKey.has(key)));
    } else if (requestedSchemas.size > 0) {
        for (const [key, table] of tablesByKey) {
            if (table.schema && requestedSchemas.has(table.schema)) selectedKeys.add(key);
        }
    } else {
        selectedKeys = new Set(tablesByKey.keys());
    }

    const visibleKeys = new Set(selectedKeys);
    const depth = options.depth ?? (requestedSchemas.size > 0 ? 1 : 0);
    let frontier = new Set(selectedKeys);
    for (let level = 0; level < depth; level += 1) {
        const next = new Set<string>();
        for (const relationship of relationships) {
            const sourceKey = tableKey(relationship.sourceSchema, relationship.sourceTable);
            const targetKey = tableKey(relationship.targetSchema, relationship.targetTable);
            if (frontier.has(sourceKey) && !visibleKeys.has(targetKey)) next.add(targetKey);
            if (frontier.has(targetKey) && !visibleKeys.has(sourceKey)) next.add(sourceKey);
        }
        next.forEach(key => visibleKeys.add(key));
        frontier = next;
        if (frontier.size === 0) break;
    }

    const visibleRelationships = relationships.filter(relationship => {
        return visibleKeys.has(tableKey(relationship.sourceSchema, relationship.sourceTable)) && visibleKeys.has(tableKey(relationship.targetSchema, relationship.targetTable));
    });
    if (visibleKeys.size > SCHEMA_GRAPH_MAX_TABLES || visibleRelationships.length > SCHEMA_GRAPH_MAX_RELATIONSHIPS) {
        return emptyResult('too_large', capabilities, visibleKeys.size, visibleRelationships.length);
    }

    const columnMode = options.columnMode ?? 'all';
    const tables = Array.from(visibleKeys)
        .map(key => {
            const table = tablesByKey.get(key);
            if (!table) return null;
            const fkColumns = foreignKeyColumns.get(key) ?? new Set<string>();
            const columns = table.columns.map(column => ({ ...column, isForeignKey: column.isForeignKey || fkColumns.has(column.name) }));
            return {
                ...table,
                id: schemaGraphTableId(table.database, table.schema, table.name),
                kind: 'table' as const,
                scope: selectedKeys.has(key) ? ('selected' as const) : ('related' as const),
                columns: columnMode === 'keys' ? columns.filter(column => column.isPrimaryKey || column.isForeignKey) : columns,
            };
        })
        .filter((table): table is SchemaGraphTable => Boolean(table))
        .sort((left, right) => (left.schema ?? '').localeCompare(right.schema ?? '') || left.name.localeCompare(right.name));

    const graphRelationships = visibleRelationships
        .map(relationship => ({
            id: relationshipId(relationship),
            constraintName: relationship.constraintName,
            sourceTableId: schemaGraphTableId(options.database, relationship.sourceSchema, relationship.sourceTable),
            sourceColumns: relationship.sourceColumns,
            targetTableId: schemaGraphTableId(options.database, relationship.targetSchema, relationship.targetTable),
            targetColumns: relationship.targetColumns,
            sourceUnique: relationship.sourceUnique,
            sourceOptional: relationship.sourceOptional,
            onUpdate: relationship.onUpdate,
            onDelete: relationship.onDelete,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));

    return {
        status: 'ready',
        tables,
        relationships: graphRelationships,
        totalTables: tables.length,
        totalRelationships: graphRelationships.length,
        limits: {
            maxTables: SCHEMA_GRAPH_MAX_TABLES,
            maxRelationships: SCHEMA_GRAPH_MAX_RELATIONSHIPS,
        },
        capabilities,
    };
}

export function buildTablesOnlySchemaGraph(options: SchemaGraphOptions, tables: SchemaGraphTableInput[], constraintsEnforced: boolean | null = null) {
    return buildSchemaGraphResult(options, tables, [], {
        relationships: false,
        compositeForeignKeys: false,
        cardinality: false,
        referentialActions: false,
        constraintsEnforced,
    });
}
