import { jsonError, jsonOk } from '@dory/automation';
import { automationGuards, automationService } from '@/lib/automation/adapters';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const sessionResult = await automationGuards.requireAutomationSession(req);
        if (sessionResult.response) {
            return sessionResult.response;
        }

        const connections = await automationService.listAutomationConnections({
            organizationId: sessionResult.value.organizationId,
            userId: sessionResult.value.user.id,
        });

        return jsonOk({ connections });
    } catch {
        return jsonError('INTERNAL_ERROR', 'Internal server error', { status: 500 });
    }
}
