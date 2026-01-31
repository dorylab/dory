import type { ModelRole } from '../types';
import type { SystemSpec } from '../types/system-spec';

type Preset = {
    model: string;
    temperature: number;
    system?: SystemSpec;
    maxOutputTokens?: number;
};

type BasePreset = Omit<Preset, 'model'>;

const BASE_PRESETS: Record<ModelRole, BasePreset> = {
    action: {
        temperature: 0,
        system: {
            persona: 'SQL Fix Assistant',
            language: 'auto',
            output: { kind: 'json' },
            rules: [
                'Prefer a directly executable fix.',
                'Do not output unrelated explanations unless requested.',
            ],
        },
    },
    chat: {
        temperature: 0.7,
        system: {
            persona: 'Database and SQL Copilot',
            language: 'auto',
            output: { kind: 'text' },
            rules: ['Be specific and actionable.'],
        },
    },
    title: {
        temperature: 0.3,
        system: {
            persona: 'Title Generator',
            language: 'auto',
            output: { kind: 'text' },
            rules: [
                'Return a concise title only.',
                'No explanations or quotation marks.',
            ],
        },
    },
    column_tagging: {
        temperature: 0,
        system: {
            persona: 'Column Semantic Tagger',
            language: 'auto',
            output: { kind: 'json', strict: true },
            rules: [
                'Do not output Markdown.',
                'Do not output code fences.',
                'Do not output comments.',
            ],
        },
    },
    schema_explanation: {
        temperature: 0,
        system: {
            persona: 'Schema Explanation Generator',
            language: 'auto',
            output: { kind: 'json', strict: true },
            rules: ['Output JSON only, no extra text.'],
        },
    },
    table_summary: {
        temperature: 0,
        maxOutputTokens: 1024,
        system: {
            persona: 'Table Summary Generator',
            language: 'auto',
            output: { kind: 'json', strict: true },
            rules: ['Output must be JSON.parseable.'],
        },
    },
    explain: {
        temperature: 0.3,
        system: {
            persona: 'SQL Explanation Assistant',
            language: 'auto',
            output: { kind: 'text' },
        },
    },
    summarize: {
        temperature: 0.3,
        system: {
            persona: 'SQL Summary Assistant',
            language: 'auto',
            output: { kind: 'text' },
        },
    },
    embedding: {
        temperature: 0,
    },
};

export function createModelPresets(models: Record<ModelRole, string>) {
    const envModel = process.env.DORY_AI_MODEL;
    const presets = {} as Record<ModelRole, Preset>;
    (Object.keys(BASE_PRESETS) as ModelRole[]).forEach((role) => {
        presets[role] = {
            ...BASE_PRESETS[role],
            model: envModel ?? models[role],
        };
    });
    return presets;
}

export type { Preset };
