import { authFetch } from '@/lib/client/auth-fetch';
import type { ActionId } from '@dory/actions';

export type ExecuteActionClientOptions = {
    organizationId?: string;
    currentConnectionId?: string | null;
    confirmationToken?: string | null;
    reason?: string | null;
    signal?: AbortSignal;
};

export async function executeActionClient<TOutput = unknown>(actionId: ActionId, input: unknown, options: ExecuteActionClientOptions = {}): Promise<TOutput> {
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

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: TOutput; message?: string; code?: string } | null;
    if (!response.ok || !payload?.ok) {
        throw Object.assign(new Error(payload?.message ?? `Action failed: ${actionId}`), {
            code: payload?.code,
            status: response.status,
        });
    }

    return payload.data as TOutput;
}
