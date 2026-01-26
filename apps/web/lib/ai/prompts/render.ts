import type { PromptEntry } from './types';

export function renderPromptEntry(
    entry: PromptEntry<any>,
    ctx?: unknown,
): string {
    return typeof entry === 'function' ? entry(ctx) : entry;
}

export function renderTemplate(
    template: string,
    vars: Record<string, string | number | null | undefined>,
): string {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
        const value = vars[key];
        return value === null || value === undefined ? '' : String(value);
    });
}
