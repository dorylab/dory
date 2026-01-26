import { createModelPresets } from './shared';

const DEFAULT_COMPATIBLE_MODEL = process.env.DORY_AI_MODEL ?? 'gpt-4o';

export const COMPATIBLE_MODEL_PRESETS = createModelPresets({
    action: DEFAULT_COMPATIBLE_MODEL,
    chat: DEFAULT_COMPATIBLE_MODEL,
    title: DEFAULT_COMPATIBLE_MODEL,
    column_tagging: DEFAULT_COMPATIBLE_MODEL,
    schema_explanation: DEFAULT_COMPATIBLE_MODEL,
    table_summary: DEFAULT_COMPATIBLE_MODEL,
    explain: DEFAULT_COMPATIBLE_MODEL,
    summarize: DEFAULT_COMPATIBLE_MODEL,
    embedding: DEFAULT_COMPATIBLE_MODEL,
});
