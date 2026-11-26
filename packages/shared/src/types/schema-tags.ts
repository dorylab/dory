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
