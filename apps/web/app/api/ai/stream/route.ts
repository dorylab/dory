import 'server-only';
import { createIdGenerator, stepCountIs } from 'ai';

import { streamText } from '@/lib/ai/gateway';
import { isLocalMissingAiEnvError, requireLocalAiRouteModel, resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { buildCloudToolSet } from '@/lib/ai/cloud-tools';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { isAiQuotaExceededError, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    try {
        const body = (await req.json()) as {
            system: string;
            messages: unknown[];
            tools?: Record<string, unknown> | null;
            toolChoice?: 'auto' | 'none';
            temperature?: number;
            maxSteps?: number;
            model?: string | null;
        };

        const execution = await resolveAiRouteExecution({
            req,
            db,
            organizationId,
            role: 'chat',
            requestedModel: body.model,
            includeModel: true,
            proxy: {
                pathname: '/api/ai/stream',
                body,
            },
        });
        if (execution.proxiedResponse) return execution.proxiedResponse;
        const model = requireLocalAiRouteModel(execution);

        console.info('[ai/stream] request model input', {
            requestedModel: body.model ?? null,
            effectiveRequestedModel: execution.requestedModel,
            source: execution.source,
            providerKey: execution.providerKey,
            providerModelName: execution.modelName,
            transport: execution.transport,
        });

        const toolSet = buildCloudToolSet(body.tools as Record<string, any> | null);

        const result = await streamText({
            model,
            system: body.system,
            messages: body.messages as any,
            tools: toolSet,
            toolChoice: body.toolChoice ?? 'auto',
            stopWhen: stepCountIs(Math.max(1, body.maxSteps ?? 1)),
            temperature: body.temperature ?? execution.preset.temperature,
            context: {
                organizationId,
                userId,
                feature: 'chat_stream',
                model: execution.modelName,
                gateway: execution.gateway,
                provider: execution.providerKey,
            },
        });

        return result.toUIMessageStreamResponse({
            generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
        });
    } catch (error) {
        if (isAiQuotaExceededError(error)) {
            return toAiQuotaExceededResponse(error);
        }

        if (isLocalMissingAiEnvError(error)) {
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
