import { createModelPresets } from './shared';

export const GOOGLE_MODEL_PRESETS = createModelPresets({
    action: 'gemini-1.5-flash-latest',
    chat: 'gemini-1.5-pro-latest',
    title: 'gemini-1.5-pro-latest',
    column_tagging: 'gemini-1.5-flash-latest',
    schema_explanation: 'gemini-1.5-flash-latest',
    table_summary: 'gemini-1.5-pro-latest',
    explain: 'gemini-1.5-flash-latest',
    summarize: 'gemini-1.5-flash-latest',
    embedding: 'gemini-1.5-pro-latest',
});
