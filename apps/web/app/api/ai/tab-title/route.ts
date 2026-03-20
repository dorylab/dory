import { generateText } from '@/lib/ai/gateway';
import { getEffectiveModelBundle } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { USE_CLOUD_AI } from '@/app/config/app';
import { proxyAiRouteIfNeeded } from '@/app/api/utils/cloud-ai-proxy';

export const POST = withUserAndOrganizationHandler(async ({ req, organizationId, userId }) => {
    try {
        const locale = await getApiLocale();
        const body = (await req.json()) as {
            sql: string;
            database?: string | null;
            model?: string | null;
        };
        const { sql, database, model: requestedModel } = body;
        const shouldForcePresetModel = USE_CLOUD_AI;

        const proxied = await proxyAiRouteIfNeeded(req, '/api/ai/tab-title', {
            body: USE_CLOUD_AI ? { ...body, model: null } : body,
        });
        if (proxied) return proxied;

        const effectiveRequestedModel = shouldForcePresetModel ? null : requestedModel;

        const { model, preset, modelName: providerModelName } = getEffectiveModelBundle('title', effectiveRequestedModel);

        if (!sql || !sql.trim()) {
            return new Response(JSON.stringify({ title: null }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const prompt = buildTabTitlePrompt({ sql, database, locale });

        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt,
            temperature: preset.temperature,
            context: {
                organizationId,
                userId,
                feature: 'tab_title',
                model: providerModelName,
                provider: (process.env.DORY_AI_PROVIDER ?? '').trim().toLowerCase() || null,
            },
        });

        const title = text.trim();

        return new Response(JSON.stringify({ title }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[api/ai/tab-title] error:', error);
        return new Response(JSON.stringify({ title: null }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
