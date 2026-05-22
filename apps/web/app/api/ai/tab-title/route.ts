import { generateText } from '@/lib/ai/gateway';
import { getEffectiveModelBundleForOrganization } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { USE_CLOUD_AI } from '@/app/config/app';
import { proxyAiRouteIfNeeded } from '@/app/api/utils/cloud-ai-proxy';
import { isAiQuotaExceededError, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import { shouldUseOrganizationProviderOverride } from '@dory/ee/ai/organization-ai-providers';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    try {
        const locale = await getApiLocale();
        const body = (await req.json()) as {
            sql: string;
            database?: string | null;
            model?: string | null;
        };
        const { sql, database, model: requestedModel } = body;
        const organizationUsesProviderOverride = await shouldUseOrganizationProviderOverride(db, organizationId);
        const shouldForcePresetModel = USE_CLOUD_AI && !organizationUsesProviderOverride;

        const proxied = organizationUsesProviderOverride
            ? null
            : await proxyAiRouteIfNeeded(req, '/api/ai/tab-title', {
                  body: USE_CLOUD_AI ? { ...body, model: null } : body,
              });
        if (proxied) return proxied;

        const effectiveRequestedModel = shouldForcePresetModel ? null : requestedModel;

        const {
            model,
            preset,
            modelName: providerModelName,
            providerKey,
        } = await getEffectiveModelBundleForOrganization('title', {
            organizationId,
            modelName: effectiveRequestedModel,
        });

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
                provider: providerKey ?? ((process.env.DORY_AI_PROVIDER ?? '').trim().toLowerCase() || null),
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
