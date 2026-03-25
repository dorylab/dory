import { isAutomationServiceError, jsonError, jsonOk, parsePositiveLimit, readJsonBody } from '@dory/automation';
import type { AutomationQueryRequest } from '@dory/automation';
import { automationGuards, automationService } from '@/lib/automation/adapters';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const sessionResult = await automationGuards.requireAutomationSession(req);
        if (sessionResult.response) {
            return sessionResult.response;
        }

        const bodyResult = await readJsonBody<Partial<AutomationQueryRequest>>(req);
        if (bodyResult.response) {
            return bodyResult.response;
        }

        const body = bodyResult.value;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return jsonError('INVALID_INPUT', 'Request body must be an object', { status: 400 });
        }

        const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
        const sql = typeof body.sql === 'string' ? body.sql.trim() : '';

        if (!connectionId) {
            return jsonError('INVALID_INPUT', 'connectionId is required', { status: 400 });
        }

        if (!sql) {
            return jsonError('INVALID_INPUT', 'sql is required', { status: 400 });
        }

        const limitResult = parsePositiveLimit(body.limit);
        if (limitResult.response) {
            return limitResult.response;
        }

        const result = await automationService.runAutomationQuery({
            organizationId: sessionResult.value.organizationId,
            userId: sessionResult.value.user.id,
            connectionId,
            sql,
            limit: limitResult.value,
        });

        return jsonOk({ result });
    } catch (error) {
        if (isAutomationServiceError(error)) {
            return jsonError(error.code, error.message, { status: error.status });
        }

        return jsonError('INTERNAL_ERROR', 'Internal server error', { status: 500 });
    }
}
