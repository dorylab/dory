import { createModelPresets } from './shared';

export const QWEN_MODEL_PRESETS = createModelPresets({
    action: 'qwen2.5-coder-32b-instruct',
    chat: 'qwen3-coder-480b-a35b-instruct',
    title: 'qwen-plus',
    column_tagging: 'qwen-plus',
    schema_explanation: 'qwen-plus',
    table_summary: 'qwen-plus',
    explain: 'qwen-plus',
    summarize: 'qwen-plus',
    embedding: 'text-embedding-v1',
});
