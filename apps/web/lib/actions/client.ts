import { authFetch } from '@/lib/client/auth-fetch';
import type { ActionExecutionEnvelope, ActionId } from '@dory/actions';

export type ExecuteActionClientOptions = {
    organizationId?: string;
    currentConnectionId?: string | null;
    confirmationToken?: string | null;
    reason?: string | null;
    signal?: AbortSignal;
};

export async function executeActionClient<TOutput = unknown>(actionId: ActionId, input: unknown, options: ExecuteActionClientOptions = {}): Promise<TOutput> {
    const envelope = await executeActionClientEnvelope<TOutput>(actionId, input, options);
    return envelope.data;
}

export async function executeActionClientEnvelope<TOutput = unknown>(
    actionId: ActionId,
    input: unknown,
    options: ExecuteActionClientOptions = {},
): Promise<ActionExecutionEnvelope<TOutput>> {
    const response = await authFetch('/api/actions/execute', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            actionId,
            input,
            organizationId: options.organizationId,
            currentConnectionId: options.currentConnectionId,
            confirmationToken: options.confirmationToken,
            reason: options.reason,
        }),
        signal: options.signal,
    });

    const payload = (await response.json().catch(() => null)) as
        | ({ ok?: boolean; message?: string; code?: string; details?: unknown } & Partial<ActionExecutionEnvelope<TOutput>>)
        | null;
    if (!response.ok || !payload?.ok) {
        throw Object.assign(new Error(payload?.message ?? `Action failed: ${actionId}`), {
            code: payload?.code,
            details: payload?.details,
            status: response.status,
        });
    }

    return {
        data: payload.data as TOutput,
        execution: payload.execution!,
    };
}
