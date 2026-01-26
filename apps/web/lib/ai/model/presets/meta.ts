import { createModelPresets } from './shared';

export const META_MODEL_PRESETS = createModelPresets({
    action: 'llama-3.1-8b-instruct',
    chat: 'llama-3.1-70b-instruct',
    title: 'llama-3.1-70b-instruct',
    column_tagging: 'llama-3.1-8b-instruct',
    schema_explanation: 'llama-3.1-8b-instruct',
    table_summary: 'llama-3.1-70b-instruct',
    explain: 'llama-3.1-8b-instruct',
    summarize: 'llama-3.1-8b-instruct',
    embedding: 'llama-3.1-70b-instruct',
});
