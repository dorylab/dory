export type ModelRole =
    | 'chat'
    | 'action'
    | 'explain'
    | 'summarize'
    | 'embedding'
    | 'title'
    | 'column_tagging'
    | 'schema_explanation'
    | 'table_summary';

export type ModelPreset = {
    model: string;
    temperature: number;
    system?: string;
    maxOutputTokens?: number;
};
