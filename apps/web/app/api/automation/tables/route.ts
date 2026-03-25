import { isAutomationServiceError, jsonError, jsonOk, normalizeOptionalSearchParam, readRequiredSearchParam } from '@dory/automation';
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

        const connectionIdResult = readRequiredSearchParam(req, 'connectionId');
        if (connectionIdResult.response) {
            return connectionIdResult.response;
        }

        const databaseResult = readRequiredSearchParam(req, 'database');
        if (databaseResult.response) {
            return databaseResult.response;
        }

        const tables = await automationService.listAutomationTables({
            organizationId: sessionResult.value.organizationId,
            userId: sessionResult.value.user.id,
            connectionId: connectionIdResult.value,
            database: databaseResult.value,
            schema: normalizeOptionalSearchParam(req, 'schema'),
        });

        return jsonOk({ tables });
    } catch (error) {
        if (isAutomationServiceError(error)) {
            return jsonError(error.code, error.message, { status: error.status });
        }

        return jsonError('INTERNAL_ERROR', 'Internal server error', { status: 500 });
    }
}
