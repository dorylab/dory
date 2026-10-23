import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { ZodError } from 'zod';
import { isLocalMissingAiEnvError } from '@/lib/ai/execution/route-dispatch';
import { isAiQuotaExceededError, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import { handleChatRequest } from '@/lib/server/chat-request';

import { withUserAndOrganizationHandler } from '../utils/with-organization-handler';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req }) => {
    try {
        return await handleChatRequest(req);
    } catch (error) {
        if (error instanceof DatabaseError || error instanceof ZodError) {
            return Response.json({ error: error.message }, { status: error instanceof DatabaseError ? error.code : 400 });
        }
        if (isAiQuotaExceededError(error)) {
            return toAiQuotaExceededResponse(error);
        }

        if (isLocalMissingAiEnvError(error)) {
            return new Response('MISSING_AI_ENV', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        console.error('[api/chat] error:', error);
        const message = error instanceof Error ? error.message : 'Internal error';
        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
});
