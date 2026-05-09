import type { ActionContext } from '@/lib/copilot/action/types';

export function formatCandidateTables(ctx: Pick<ActionContext, 'candidateTables' | 'database' | 'activeSchema'>) {
    const tables = Array.isArray(ctx.candidateTables) ? ctx.candidateTables.filter(table => typeof table?.name === 'string' && table.name.trim()) : [];
    if (!tables.length) return '';

    return tables
        .slice(0, 12)
        .map(table => {
            const parts: string[] = [];
            if (table.database?.trim()) {
                parts.push(table.database.trim());
            } else if (ctx.database?.trim()) {
                parts.push(ctx.database.trim());
            }
            if (table.schema?.trim()) {
                parts.push(table.schema.trim());
            } else if (ctx.activeSchema?.trim()) {
                parts.push(ctx.activeSchema.trim());
            }
            parts.push(table.name.trim());
            return `- ${parts.join('.')}`;
        })
        .join('\n');
}
