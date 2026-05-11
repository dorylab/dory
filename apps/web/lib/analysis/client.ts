import { authFetch } from '@/lib/client/auth-fetch';
import type { RunAnalysisRequest, RunAnalysisResponse } from '@dory/analysis/types';

type ApiEnvelope<T> = {
    code: number;
    message?: string;
    data?: T;
};

function assertOk<T>(res: Response, data: ApiEnvelope<T>, fallback: string) {
    if (!res.ok || !data || data.code !== 0) {
        throw new Error(data?.message || fallback);
    }
}

export async function runAnalysisRequest(request: RunAnalysisRequest & { tabId?: string }): Promise<RunAnalysisResponse> {
    const res = await authFetch('/api/analysis/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(request),
    });

    const payload = (await res.json()) as ApiEnvelope<RunAnalysisResponse>;
    assertOk(res, payload, 'Failed to run analysis.');
    if (!payload.data) {
        throw new Error('Missing analysis response payload.');
    }

    return payload.data;
}
