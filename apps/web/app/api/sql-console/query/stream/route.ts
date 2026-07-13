import { randomUUID } from 'node:crypto';

import { ActionError, assertActionAllowed, toActionError } from '@dory/actions';
import type { NextRequest } from 'next/server';
import { queryExecuteAction } from '@/lib/actions/server/domains/query/execute';
import { executeSqlActionStream, type QueryExecutionStreamEvent } from '@/lib/actions/server/domains/query/execute-operation';
import { resolveActionRequest } from '@/lib/actions/server/context';

export const runtime = 'nodejs';

type StreamEnvelope =
    | QueryExecutionStreamEvent
    | {
          type: 'error';
          payload: {
              sessionId?: string;
              message: string;
              code?: string;
          };
      };

function jsonError(error: unknown) {
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

    return Response.json(
        {
            ok: false,
            code: actionError.code,
            message: actionError.message,
            details: actionError.details,
        },
        { status: actionError.status },
    );
}

function eventLine(event: StreamEnvelope) {
    return `${JSON.stringify(event)}\n`;
}

export async function POST(req: NextRequest) {
    try {
        const { ctx, body } = await resolveActionRequest(req);
        const parsedInput = queryExecuteAction.inputSchema.safeParse(body.input ?? {});
        if (!parsedInput.success) {
            throw new ActionError('ACTION_INPUT_INVALID', 'Invalid input for action "query.execute".', {
                status: 400,
                details: parsedInput.error.issues,
            });
        }

        if (!queryExecuteAction.exposure.actors.includes(ctx.actor.type)) {
            throw new ActionError('ACTION_ACTOR_NOT_ALLOWED', `Actor type "${ctx.actor.type}" is not allowed to execute action "query.execute".`, { status: 403 });
        }

        await assertActionAllowed(ctx as any, queryExecuteAction as any, parsedInput.data, {
            confirmationToken: body.confirmationToken,
        });

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                let closed = false;
                const close = () => {
                    if (closed) return;
                    closed = true;
                    try {
                        controller.close();
                    } catch {
                        // The client may have already closed the stream.
                    }
                };
                const emit = (event: StreamEnvelope) => {
                    if (closed) return;
                    try {
                        controller.enqueue(encoder.encode(eventLine(event)));
                    } catch {
                        closed = true;
                    }
                };
                req.signal.addEventListener('abort', close, { once: true });

                void (async () => {
                    try {
                        const actionRunId = randomUUID();
                        await executeSqlActionStream(
                            {
                                ...ctx,
                                actionRunId,
                                auditSource: queryExecuteAction.audit.sourceByActor?.[ctx.actor.type] ?? ctx.auditSource ?? null,
                            },
                            parsedInput.data,
                            {
                                signal: req.signal,
                                onEvent: emit,
                            },
                        );
                    } catch (error) {
                        const actionError = toActionError(error);
                        emit({
                            type: 'error',
                            payload: {
                                sessionId: parsedInput.data.sessionId ?? undefined,
                                message: actionError.message,
                                code: actionError.code,
                            },
                        });
                    } finally {
                        close();
                    }
                })();
            },
            cancel() {
                // The request signal is wired into the runner. Nothing else is needed here.
            },
        });

        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'X-Accel-Buffering': 'no',
            },
        });
    } catch (error) {
        return jsonError(error);
    }
}
