import { createModelPresets } from './shared';

export const ANTHROPIC_MODEL_PRESETS = createModelPresets({
    action: 'claude-3-5-haiku-latest',
    chat: 'claude-3-5-sonnet-latest',
    title: 'claude-3-5-sonnet-latest',
    column_tagging: 'claude-3-5-haiku-latest',
    schema_explanation: 'claude-3-5-haiku-latest',
    table_summary: 'claude-3-5-sonnet-latest',
    explain: 'claude-3-5-haiku-latest',
    summarize: 'claude-3-5-haiku-latest',
    embedding: 'claude-3-5-sonnet-latest',
});
