// lib/ai/provider.ts
import 'server-only';

import { getColumnTags } from './runtime/features/column-tagging';
import { getTableSummary } from './runtime/features/table-summary';
import { getColumnExplanations } from './runtime/features/schema-explanations';

export type AiProvider = {
    getColumnTags: typeof getColumnTags;
    getColumnExplanations: typeof getColumnExplanations;
    getTableSummary: typeof getTableSummary;
};

export const openProvider: AiProvider = {
    getColumnTags,
    getColumnExplanations,
    getTableSummary,
};

let provider: AiProvider = openProvider;

async function loadProProvider(): Promise<Partial<AiProvider> | null> {
    try {
        const path = './pro/provider';
        const mod: any = await import(path);
        return (mod?.default ?? mod) as Partial<AiProvider>;
    } catch (e) {
        if (process.env.AI_PROVIDER_DEBUG) {
            console.debug('[ai][provider] fallback to open provider:', e);
        }
        return null;
    }
}

export async function getAiProvider(): Promise<AiProvider> {
    if (provider !== openProvider) return provider;

    const pro = await loadProProvider();
    if (pro) provider = { ...openProvider, ...pro };

    return provider;
}

export default openProvider; // Keep if you already rely on default provider call sites
