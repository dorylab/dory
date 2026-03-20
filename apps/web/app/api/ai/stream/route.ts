import 'server-only';
import { createIdGenerator, stepCountIs } from 'ai';

import { streamText } from '@/lib/ai/gateway';
import { getEffectiveModelBundle } from '@/lib/ai/model';
import { buildCloudToolSet } from '@/lib/ai/cloud-tools';
import { isMissingAiEnvError } from '@/lib/ai/errors';
import { USE_CLOUD_AI } from '@/app/config/app';
import { proxyAiRouteIfNeeded } from '@/app/api/utils/cloud-ai-proxy';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req, organizationId, userId }) => {
    try {
        const proxied = await proxyAiRouteIfNeeded(req, '/api/ai/stream');
        if (proxied) return proxied;

        const body = (await req.json()) as {
            system: string;
            messages: unknown[];
            tools?: Record<string, unknown> | null;
            toolChoice?: 'auto' | 'none';
            temperature?: number;
            maxSteps?: number;
            model?: string | null;
        };

        const envProvider = (process.env.DORY_AI_PROVIDER ?? '').trim().toLowerCase();
        const envBaseUrl = (process.env.DORY_AI_URL ?? '').trim().toLowerCase();
        const isCloudflareGatewayUrl = envBaseUrl.includes('gateway.ai.cloudflare.com');
        const shouldForcePresetModel =
            USE_CLOUD_AI ||
            envProvider === 'cloudflare' ||
            envProvider === 'cloudflare-gateway' ||
            isCloudflareGatewayUrl;
        const requestedModel = shouldForcePresetModel ? null : body.model;

        console.info('[ai/stream] request model input', {
            requestedModel: body.model ?? null,
            envProvider: process.env.DORY_AI_PROVIDER ?? null,
            envBaseUrl: process.env.DORY_AI_URL ?? null,
            envModel: process.env.DORY_AI_MODEL ?? null,
            useCloud: USE_CLOUD_AI,
            forcePresetModel: shouldForcePresetModel,
        });

        const { model, preset, modelName: providerModelName } = getEffectiveModelBundle('chat', requestedModel);
        console.info('[ai/stream] model resolution', {
            requestedModel: body.model ?? null,
            effectiveRequestedModel: requestedModel ?? null,
            providerModelName,
            presetModel: preset.model,
            envProvider: process.env.DORY_AI_PROVIDER ?? null,
            envBaseUrl: process.env.DORY_AI_URL ?? null,
            envModel: process.env.DORY_AI_MODEL ?? null,
            useCloud: USE_CLOUD_AI,
            forcePresetModel: shouldForcePresetModel,
        });

        const toolSet = buildCloudToolSet(
            body.tools as Record<string, any> | null,
        );

        const result = streamText({
            model,
            system: body.system,
            messages: body.messages as any,
            tools: toolSet,
            toolChoice: body.toolChoice ?? 'auto',
            stopWhen: stepCountIs(Math.max(1, body.maxSteps ?? 1)),
            temperature: body.temperature ?? preset.temperature,
            context: {
                organizationId,
                userId,
                feature: 'chat_stream',
                model: providerModelName,
                gateway: isCloudflareGatewayUrl ? 'cloudflare' : 'direct',
                provider: envProvider || null,
            },
        });

        return result.toUIMessageStreamResponse({
            generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
        });
    } catch (error) {
        if (isMissingAiEnvError(error) && !USE_CLOUD_AI) {
            return new Response('MISSING_AI_ENV', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        console.error('[api/ai/stream] error:', error);
        const message = error instanceof Error ? error.message : 'Internal error';
        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
});
