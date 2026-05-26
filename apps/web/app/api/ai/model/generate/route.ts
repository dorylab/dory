import 'server-only';

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
        const result = await model.doGenerate({
            ...(body.callOptions ?? {}),
            abortSignal: req.signal,
        } as any);

        return Response.json(result);
    } catch (error) {
        if (isLocalMissingAiEnvError(error)) {
            return new Response('MISSING_AI_ENV', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        console.error('[api/ai/model/generate] error:', error);
        const message = error instanceof Error ? error.message : 'Internal error';
        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
});
