import { z } from 'zod';

import { generateSqlName } from '@/lib/server/sql-naming';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import type { AiActionContext } from './shared';

export { buildSqlFallbackName as buildFallbackTabTitle } from '@dory/shared/utils/sql-name';

async function runTabTitleAction(ctx: AiActionContext, input: { sql: string; database?: string | null; model?: string | null }) {
    if (!input.sql.trim()) return { title: null };
    const { title } = await generateSqlName(ctx, input);
    return { title };
}

export const aiTabTitleAction = defineWebAction({
    id: 'ai.tabTitle',
    domain: 'ai',
    kind: 'query',
    risk: 'low',
    inputSchema: z.object({
        sql: z.string(),
        database: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_generate_tab_title',
        title: 'Generate tab title',
        description: 'Generate a short SQL console tab title from SQL and database context.',
    },
    handler: runTabTitleAction,
});
