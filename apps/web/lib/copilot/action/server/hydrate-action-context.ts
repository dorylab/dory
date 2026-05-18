import 'server-only';

import { inferSqlDraftContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/infer-sql-context';
import { buildSchemaContext, buildSchemaContextForTables, getDefaultSchemaSampleLimits } from '@/lib/ai/prompts';
import type { ActionContext } from '../types';

export async function hydrateActionContext(ctx: ActionContext): Promise<ActionContext> {
    if (!ctx.organizationId || !ctx.userId || !ctx.connectionId) {
        return ctx;
    }

    const explicitTables = Array.isArray(ctx.candidateTables) ? ctx.candidateTables.filter(table => typeof table?.name === 'string' && table.name.trim()) : [];

    if (explicitTables.length) {
        const nextCtx = {
            ...ctx,
            candidateTables: explicitTables.slice(0, 12),
        };
        return await hydrateSchemaContext(nextCtx);
    }

    const inferred = await inferSqlDraftContext({
        dialect: ctx.dialect,
        editorText: ctx.sql,
        baselineDatabase: ctx.database ?? null,
    });

    if (!inferred.tables.length) {
        return await hydrateSchemaContext(ctx);
    }

    return await hydrateSchemaContext({
        ...ctx,
        candidateTables: inferred.tables.map(table => ({
            database: table.database ?? inferred.database ?? ctx.database ?? null,
            schema: table.schema ?? inferred.schema ?? null,
            name: table.name,
        })),
        activeSchema: ctx.activeSchema ?? inferred.schema ?? undefined,
    });
}

async function hydrateSchemaContext(ctx: ActionContext): Promise<ActionContext> {
    if (ctx.schemaContext?.trim() || !ctx.organizationId || !ctx.userId || !ctx.connectionId) {
        return ctx;
    }

    const defaults = getDefaultSchemaSampleLimits();
    const candidateTables = Array.isArray(ctx.candidateTables) ? ctx.candidateTables.filter(table => typeof table?.name === 'string' && table.name.trim()).slice(0, 12) : [];

    const schemaContext =
        shouldUseBroadSchemaContext(ctx) || !candidateTables.length
            ? await buildSchemaContext({
                  userId: ctx.userId,
                  organizationId: ctx.organizationId,
                  datasourceId: ctx.connectionId,
                  database: ctx.database ?? null,
                  schema: ctx.activeSchema ?? null,
                  tableSampleLimit: defaults.table,
                  columnSampleLimit: defaults.column,
              })
            : await buildSchemaContextForTables({
                  userId: ctx.userId,
                  organizationId: ctx.organizationId,
                  datasourceId: ctx.connectionId,
                  database: ctx.database ?? null,
                  schema: ctx.activeSchema ?? null,
                  tables: candidateTables,
                  columnSampleLimit: defaults.column,
              });

    return {
        ...ctx,
        candidateTables,
        schemaContext: schemaContext ?? undefined,
    };
}

function shouldUseBroadSchemaContext(ctx: ActionContext) {
    const message = ctx.error?.message ?? '';
    const code = String(ctx.error?.code ?? '');

    return code === '42P01' || /relation\s+["'`][^"'`]+["'`]\s+does\s+not\s+exist/i.test(message);
}
