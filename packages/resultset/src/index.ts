export type ResultSetLogicalType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'binary' | 'unknown';

export type ResultSetColumn = {
    name: string;
    databaseType?: string;
    logicalType?: ResultSetLogicalType;
    nullable?: boolean;
    displayName?: string;
    description?: string;
};

export type ResultSetOperation = 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'unknown' | (string & {});
export type ResultSetStatus = 'success' | 'error' | 'canceled' | (string & {});
export type ResultSetSourceType = 'query-run' | 'derived' | 'imported' | 'manual';
export type ResultSetActorType = 'user' | 'agent' | 'mcp' | 'automation' | (string & {});
export type ResultSetDataAvailability = 'none' | 'preview-only' | 'full';

export type ResultSetArtifactRef = {
    store: 'filesystem' | 's3' | (string & {});
    artifactId: string;
    basePath: string;
    manifestPath: string;
    previewPath?: string;
    dataPath?: string;
    dataAvailability: ResultSetDataAvailability;
};

export type ResultSetFileManifest = {
    path: string;
    format: 'json' | 'parquet' | (string & {});
    rowCount?: number;
    byteSize?: number;
};

export type ResultSetManifest = {
    format: 'dory.resultset.v1';
    artifactId: string;
    organizationId: string;
    kind: 'sql-result-set';
    status: ResultSetStatus;
    source: {
        type: ResultSetSourceType;
        queryRunId?: string | null;
        connectionId?: string | null;
        workspaceId?: string | null;
        tabId?: string | null;
        workId?: string | null;
        agentRunId?: string | null;
        actorType?: ResultSetActorType | null;
        actorId?: string | null;
    };
    sql?: {
        text?: string | null;
        dialect?: string | null;
        operation?: ResultSetOperation | null;
    };
    error?: {
        message?: string | null;
        code?: string | null;
        sqlState?: string | null;
        meta?: unknown;
    };
    schema: ResultSetColumn[];
    rowCount?: number | null;
    previewRowCount: number;
    limited: boolean;
    limit?: number | null;
    files: {
        preview?: ResultSetFileManifest;
        data?: ResultSetFileManifest;
    };
    lineage?: {
        parentResultSetId?: string | null;
        previousResultSetId?: string | null;
        refreshOfResultSetId?: string | null;
        derivedFromResultSetId?: string | null;
    };
    createdAt: string;
    updatedAt: string;
    contentHash?: string | null;
};

export type ResultSetPreview = {
    columns: ResultSetColumn[];
    rows: Record<string, unknown>[];
    truncated: boolean;
    rowCount?: number | null;
    previewRowCount: number;
};

export type BuildResultSetPreviewInput = {
    columns: ResultSetColumn[];
    rows: unknown[];
    rowCount?: number | null;
    maxRows?: number;
    maxBytes?: number;
};

export type ResultSetDataWriterResult = {
    path: string;
    format: 'parquet';
    rowCount: number;
    byteSize?: number;
};

export type ResultSetDataWriter = {
    write(input: {
        artifactId: string;
        schema: ResultSetColumn[];
        rows: AsyncIterable<Record<string, unknown>> | Record<string, unknown>[];
        target: unknown;
    }): Promise<ResultSetDataWriterResult | null>;
};

export class NoopFullDataWriter implements ResultSetDataWriter {
    async write(): Promise<ResultSetDataWriterResult | null> {
        return null;
    }
}

export function buildResultSetPreview(input: BuildResultSetPreviewInput): ResultSetPreview {
    const maxRows = input.maxRows ?? 200;
    const maxBytes = input.maxBytes ?? 2 * 1024 * 1024;
    const normalizedRows = input.rows.map(row => normalizeRow(row));
    const rows: Record<string, unknown>[] = [];

    for (const row of normalizedRows.slice(0, maxRows)) {
        const candidate = [...rows, row];
        if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > maxBytes) break;
        rows.push(row);
    }

    const totalRows = input.rowCount ?? normalizedRows.length;
    return {
        columns: input.columns,
        rows,
        truncated: rows.length < normalizedRows.length || (typeof totalRows === 'number' && rows.length < totalRows),
        rowCount: input.rowCount ?? normalizedRows.length,
        previewRowCount: rows.length,
    };
}

export function inferResultSetColumns(rows: unknown[], explicitColumns?: unknown): ResultSetColumn[] {
    if (Array.isArray(explicitColumns)) {
        return explicitColumns.map((column, index) => normalizeColumn(column, index)).filter((column): column is ResultSetColumn => Boolean(column));
    }

    const names = new Set<string>();
    for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        for (const key of Object.keys(row)) names.add(key);
    }

    return [...names].map(name => ({ name, logicalType: 'unknown' }));
}

export function resultSetDataAvailability(manifest: ResultSetManifest): ResultSetDataAvailability {
    if (manifest.files.data) return 'full';
    if (manifest.files.preview) return 'preview-only';
    return 'none';
}

function normalizeColumn(column: unknown, index: number): ResultSetColumn | null {
    if (!column || typeof column !== 'object') return null;
    const value = column as Record<string, unknown>;
    const rawName = value.name ?? value.field ?? value.key ?? `column_${index + 1}`;
    if (typeof rawName !== 'string' || !rawName) return null;
    return {
        name: rawName,
        databaseType: typeof value.databaseType === 'string' ? value.databaseType : typeof value.type === 'string' ? value.type : undefined,
        logicalType: normalizeLogicalType(value.logicalType),
        nullable: typeof value.nullable === 'boolean' ? value.nullable : undefined,
        displayName: typeof value.displayName === 'string' ? value.displayName : undefined,
        description: typeof value.description === 'string' ? value.description : undefined,
    };
}

function normalizeLogicalType(value: unknown): ResultSetLogicalType | undefined {
    if (value === 'string' || value === 'number' || value === 'boolean' || value === 'date' || value === 'datetime' || value === 'json' || value === 'binary' || value === 'unknown') {
        return value;
    }
    return undefined;
}

function normalizeRow(row: unknown): Record<string, unknown> {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { value: row };
    return row as Record<string, unknown>;
}
