import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes } from '@dory/shared/errors';
import { ResponseUtil } from '@/lib/result';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { hasMetadataCapability } from '@dory/drivers/types';
import { withAutomationHandler } from '../with-automation-handler';

/**
 * GET /api/automation/schema?connectionId=xxx&database=mydb
 *
 * Get database schema (tables, columns, views) for a given connection.
 */
export const GET = withAutomationHandler(async ({ req, userId, organizationId }) => {
    const connectionId = req.nextUrl.searchParams.get('connectionId');
    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: 'Missing required query parameter: connectionId',
            }),
            { status: 400 },
        );
    }

    const database = req.nextUrl.searchParams.get('database');

    try {
        const { entry, config } = await ensureConnectionPoolForUser(userId, organizationId, connectionId, null);
        const metadata = entry.instance.capabilities.metadata;

        const targetDatabase = database ?? (typeof config.database === 'string' ? config.database : 'default');
        if (!hasMetadataCapability(metadata, 'getSchema')) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.ERROR,
                    message: 'This connection does not support schema introspection.',
                }),
                { status: 400 },
            );
        }

        const schema = await metadata.getSchema(targetDatabase);
        return NextResponse.json(ResponseUtil.success({ schema }));
    } catch (error: any) {
        console.error('[automation/schema] failed', error);
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.ERROR,
                message: error?.message ?? 'Failed to retrieve schema',
            }),
            { status: 500 },
        );
    }
});
