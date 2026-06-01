import { NextResponse, type NextRequest } from 'next/server';
import type { ActionId } from '@dory/actions';
import { ActionError, toActionError } from '@dory/actions';
import { executeUiAction } from '@/lib/actions/server/adapters/ui';
import { resolveActionRequest } from '@/lib/actions/server/context';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
    const actionError =
        error instanceof ActionError
            ? error
            : error && typeof error === 'object' && 'status' in error
              ? new ActionError((error as any).code ?? 'ACTION_EXECUTION_FAILED', error instanceof Error ? error.message : 'Action execution failed', {
                    status: Number((error as any).status) || 500,
                    details: (error as any).details,
                    cause: error,
                })
              : toActionError(error);

    return NextResponse.json(
        {
            ok: false,
            code: actionError.code,
            message: actionError.message,
            details: actionError.details,
        },
        { status: actionError.status },
    );
}

export async function POST(req: NextRequest) {
    try {
        const { ctx, body } = await resolveActionRequest(req);
        if (!body.actionId) {
            throw new ActionError('ACTION_INPUT_INVALID', 'Missing actionId.', { status: 400 });
        }

        const data = await executeUiAction(ctx, body.actionId as ActionId, body.input ?? {}, {
            confirmationToken: body.confirmationToken,
            reason: body.reason,
        });
        return NextResponse.json({
            ok: true,
            actionId: body.actionId,
            data,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
