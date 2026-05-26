import 'server-only';

import { JsonToSseTransformStream } from 'ai';

import { resolveAiRouteExecution, requireLocalAiRouteModel, isLocalMissingAiEnvError } from '@/lib/ai/execution/route-dispatch';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    try {
        const body = (await req.json()) as {
            model?: string | null;
            callOptions?: Record<string, unknown>;
        };

        const execution = await resolveAiRouteExecution({
            req,
            db,
            organizationId,
            role: 'chat',
            requestedModel: body.model ?? null,
            allowCloudProxy: false,
            includeModel: true,
        });
        const model = requireLocalAiRouteModel(execution);
        const result = await model.doStream({
            ...(body.callOptions ?? {}),
            abortSignal: req.signal,
        } as any);

        return new Response(result.stream.pipeThrough(new JsonToSseTransformStream()).pipeThrough(new TextEncoderStream()), {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
            },
        });
    } catch (error) {
        if (isLocalMissingAiEnvError(error)) {
            return new Response('MISSING_AI_ENV', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        console.error('[api/ai/model/stream] error:', error);
        const message = error instanceof Error ? error.message : 'Internal error';
        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
});
