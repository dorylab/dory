import 'server-only';

import { inferSqlDraftContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/infer-sql-context';
import type { ActionContext } from '../types';

export async function hydrateActionContext(ctx: ActionContext): Promise<ActionContext> {
    if (!ctx.organizationId || !ctx.userId) {
        return ctx;
    }

    const explicitTables = Array.isArray(ctx.candidateTables)
        ? ctx.candidateTables.filter(table => typeof table?.name === 'string' && table.name.trim())
        : [];

    if (explicitTables.length) {
        return {
            ...ctx,
            candidateTables: explicitTables.slice(0, 12),
        };
    }

    const inferred = await inferSqlDraftContext({
        dialect: ctx.dialect,
        editorText: ctx.sql,
        baselineDatabase: ctx.database ?? null,
    });

    if (!inferred.tables.length) {
        return ctx;
    }

    return {
        ...ctx,
        candidateTables: inferred.tables.map(table => ({
            database: table.database ?? inferred.database ?? ctx.database ?? null,
            schema: table.schema ?? inferred.schema ?? null,
            name: table.name,
        })),
    };
}
