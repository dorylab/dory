export type ColumnInfo = {
    name: string;
    type: string;
    defaultValue?: string | null;
    nullable?: boolean;
    comment?: string | null;

    
    semanticTags?: string[];         
    semanticSummary?: string | null; 
};

export type ColumnsSectionProps = {
    tableName?: string;
    loading?: boolean;
    loadingTags?: boolean;
    columns: ColumnInfo[];
};