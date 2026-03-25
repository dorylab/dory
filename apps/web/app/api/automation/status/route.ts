import { jsonError, jsonOk } from '@dory/automation';
import { automationGuards } from '@/lib/automation/adapters';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const sessionResult = await automationGuards.requireAutomationSession(req);
        if (sessionResult.response) {
            return sessionResult.response;
        }

        return jsonOk({
            app: {
                running: true as const,
            },
            auth: {
                signedIn: true as const,
                user: sessionResult.value.user,
            },
        });
    } catch {
        return jsonError('INTERNAL_ERROR', 'Internal server error', { status: 500 });
    }
}
