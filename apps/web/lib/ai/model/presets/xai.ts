import { createModelPresets } from './shared';

export const xAI_MODEL_PRESETS = createModelPresets({
    action: 'grok-2-mini',
    chat: 'grok-2-latest',
    title: 'grok-2-latest',
    column_tagging: 'grok-2-mini',
    schema_explanation: 'grok-2-mini',
    table_summary: 'grok-2-latest',
    explain: 'grok-2-mini',
    summarize: 'grok-2-mini',
    embedding: 'grok-2-latest',
});
