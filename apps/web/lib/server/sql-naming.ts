import { randomUUID } from 'node:crypto';
import type { ActionContext } from '@dory/actions';
import type { SqlNamingTarget } from '@dory/database/postgres/impl/sql-naming';
import { buildSqlFallbackName, cleanSqlName } from '@dory/shared/utils/sql-name';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { generateText } from '@/lib/ai/gateway';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts/tasks/sql.title';
import type { WebActionServices } from '@/lib/actions/server/types';

type NamingContext = Pick<ActionContext<WebActionServices>, 'organizationId' | 'userId' | 'locale' | 'services'>;

export async function generateSqlName(ctx: NamingContext, input: { sql: string; database?: string | null; model?: string | null }) {
    const fallback = buildSqlFallbackName(input.sql, ctx.locale);
    try {
        const { model, preset, modelName, providerKey, gateway } = await resolveAiLanguageModel({
            role: 'title',
            organizationId: ctx.organizationId,
            requestedModel: input.model ?? null,
            req: ctx.services.req,
        });
        const result = await generateText({
            model,
            instructions: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt: buildTabTitlePrompt({ ...input, locale: ctx.locale }),
            temperature: preset.temperature,
            maxOutputTokens: 96,
            abortSignal: AbortSignal.timeout(15_000),
            context: { organizationId: ctx.organizationId, userId: ctx.userId, feature: 'tab_title', model: modelName, provider: providerKey, gateway },
        });
        const title = cleanSqlName(result.text);
        return { title: title || fallback, source: title ? ('ai' as const) : ('rule' as const) };
    } catch {
        return { title: fallback, source: 'rule' as const };
    }
}

// One factory per execution: deduplicate model calls only within this request.
export function createSqlNamer(ctx: NamingContext, database?: string | null, generate: typeof generateSqlName = generateSqlName) {
    const generated = new Map<string, ReturnType<typeof generateSqlName>>();
    const queue = async (target: SqlNamingTarget, sql: string, namingSql = sql) => {
        if (!sql.trim()) return null;
        const title = buildSqlFallbackName(namingSql, ctx.locale);
        const requestId = randomUUID();
        const pending = Boolean(ctx.services.defer);
        const claimed = await ctx.services.db.sqlNaming.claim(target, { sql, title, requestId, pending });
        if (!claimed) return null;
        if (ctx.services.defer) {
            ctx.services.defer(async () => {
                try {
                    const key = namingSql.trim().replace(/;\s*$/, '');
                    let result = generated.get(key);
                    if (!result) {
                        result = generate(ctx, { sql: namingSql, database });
                        generated.set(key, result);
                    }
                    const name = await result;
                    const generatedTitle = cleanSqlName(name.title);
                    await ctx.services.db.sqlNaming.complete(target, { requestId, sql, title: generatedTitle || title, source: generatedTitle ? name.source : 'rule' });
                } catch (error) {
                    console.error('[sql-naming] completion failed', error);
                    await ctx.services.db.sqlNaming.complete(target, { requestId, sql, title, source: 'rule' }).catch(() => undefined);
                }
            });
        }
        return { title, namingSource: pending ? ('pending' as const) : ('rule' as const), namingRequestId: requestId };
    };
    const tab = async (tabId: string | null | undefined, connectionId: string, workId?: string | null) => {
        if (!tabId) return null;
        const row = await ctx.services.db.tabState.loadTabState(tabId, ctx.userId, connectionId, workId);
        if (!row || row.tabType !== 'sql' || row.namingSource !== 'default') return null;
        return queue({ type: 'tab', id: tabId, userId: ctx.userId, connectionId, workId }, row.content);
    };
    return { queue, tab, fallback: (sql: string) => buildSqlFallbackName(sql, ctx.locale) };
}
