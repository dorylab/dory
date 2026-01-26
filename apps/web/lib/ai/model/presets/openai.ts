import { createModelPresets } from './shared';

export const OPENAI_MODEL_PRESETS = createModelPresets({
    action: 'gpt-4o-mini',
    chat: 'gpt-4o',
    title: 'gpt-4o',
    column_tagging: 'gpt-4o-mini',
    schema_explanation: 'gpt-4o-mini',
    table_summary: 'gpt-4o',
    explain: 'gpt-4o-mini',
    summarize: 'gpt-4o-mini',
    embedding: 'text-embedding-3-large',
});
