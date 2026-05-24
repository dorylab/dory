import { generateText } from '@/lib/ai/gateway';
import { requireLocalAiRouteModel, resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { isAiQuotaExceededError, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    try {
        const locale = await getApiLocale();
        const body = (await req.json()) as {
            sql: string;
            database?: string | null;
            model?: string | null;
        };
        const { sql, database, model: requestedModel } = body;
        const execution = await resolveAiRouteExecution({
            req,
            db,
            organizationId,
            role: 'title',
            requestedModel,
            includeModel: true,
            proxy: {
                pathname: '/api/ai/tab-title',
                body,
            },
        });
        if (execution.proxiedResponse) return execution.proxiedResponse;
        const model = requireLocalAiRouteModel(execution);

        if (!sql || !sql.trim()) {
            return new Response(JSON.stringify({ title: null }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const prompt = buildTabTitlePrompt({ sql, database, locale });

        const { text } = await generateText({
            model,
            system: compileSystemPrompt(execution.preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt,
            temperature: execution.preset.temperature,
            context: {
                organizationId,
                userId,
                feature: 'tab_title',
                model: execution.modelName,
                provider: execution.providerKey,
                gateway: execution.gateway,
            },
        });

        const title = text.trim();

        return new Response(JSON.stringify({ title }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        if (isAiQuotaExceededError(error)) {
            return toAiQuotaExceededResponse(error, { title: null });
        }

        console.error('[api/ai/tab-title] error:', error);
        return new Response(JSON.stringify({ title: null }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
