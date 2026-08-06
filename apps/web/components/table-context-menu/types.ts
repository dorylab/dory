export type TableContextTarget = {
    database: string;
    schema?: string | null;
    tableName: string;
    tableLabel?: string;
    unqualifiedTableName: string;
};

export type RenameTableTarget = TableContextTarget & {
    nextName: string;
};
