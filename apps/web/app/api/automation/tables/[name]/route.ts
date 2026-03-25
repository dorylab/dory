import { isAutomationServiceError, jsonError, jsonOk, normalizeOptionalSearchParam, readRequiredSearchParam } from '@dory/automation';
import { automationGuards, automationService } from '@/lib/automation/adapters';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodeRouteParam(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export async function GET(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    try {
        const sessionResult = await automationGuards.requireAutomationSession(req);
        if (sessionResult.response) {
            return sessionResult.response;
        }

        const { name } = await context.params;
        const table = decodeRouteParam(name).trim();
        if (!table) {
            return jsonError('INVALID_INPUT', 'table name is required', { status: 400 });
        }

        const connectionIdResult = readRequiredSearchParam(req, 'connectionId');
        if (connectionIdResult.response) {
            return connectionIdResult.response;
        }

        const databaseResult = readRequiredSearchParam(req, 'database');
        if (databaseResult.response) {
            return databaseResult.response;
        }

        const tableDescription = await automationService.describeAutomationTable({
            organizationId: sessionResult.value.organizationId,
            userId: sessionResult.value.user.id,
            connectionId: connectionIdResult.value,
            table,
            database: databaseResult.value,
            schema: normalizeOptionalSearchParam(req, 'schema'),
        });

        return jsonOk({ table: tableDescription });
    } catch (error) {
        if (isAutomationServiceError(error)) {
            return jsonError(error.code, error.message, { status: error.status });
        }

        return jsonError('INTERNAL_ERROR', 'Internal server error', { status: 500 });
    }
}
