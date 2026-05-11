export type AiSchemaFeature =
    | 'column_tagging'
    | 'table_overview'
    | 'explain_summary'
    | string;

export type AiSchemaCacheRecord = {
    id: string;
    organizationId: string;
    connectionId: string;
    catalog: string;
    feature: string;
    schemaHash: string;
    model: string;
    promptVersion: number;
    dbType: string | null;
    databaseName: string | null;
    tableName: string | null;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
};

export type AiSchemaCacheKey = {
    organizationId: string;
    connectionId: string;
    catalog: string;
    feature: AiSchemaFeature;
    schemaHash: string;
    model: string;
    promptVersion: number;
};

export type AiSchemaCacheUpsert = AiSchemaCacheKey & {
    dbType?: string | null;
    databaseName?: string | null;
    tableName?: string | null;
    payload: unknown;
};

export interface AiSchemaCacheRepository {
    init(): Promise<void>;

    find(key: AiSchemaCacheKey): Promise<AiSchemaCacheRecord | null>;

    upsert(entry: AiSchemaCacheUpsert): Promise<void>;

    deleteByConnection(organizationId: string, connectionId: string): Promise<void>;
}

export type ColumnInput = {
    name: string;
    type?: string;
    comment?: string | null;
    defaultValue?: string | null;
    nullable?: boolean;
};

export type SchemaTag = {
    name: string;
    semanticTags: string[];
    semanticSummary?: string | null;
};

export type SchemaTagResponse = {
    columns: SchemaTag[];
    raw?: string;
};
