/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { resolveCatalogContext } from '../../../_utils';
import { hasMetadataCapability } from '@dory/drivers/types';
import { ErrorCodes } from '@dory/shared/errors';
import { destroyDriverPool } from '@dory/drivers/core';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

type FunctionDetailParams = {
    database: string;
    functionName: string;
};

export async function GET(req: NextRequest, context: { params: Promise<FunctionDetailParams> }) {
    return withUserAndOrganizationHandler(async ({ userId, organizationId }) => {
        const resolved = await resolveCatalogContext(req, context, { userId, organizationId });
        if (resolved.response) return resolved.response;

        let { entry, database } = resolved.resolved!;
        let metadata = entry.instance.capabilities.metadata;

        if (!hasMetadataCapability(metadata, 'getFunctionDetail')) {
            const datasourceId = req.headers.get('x-connection-id');
            if (datasourceId) {
                await destroyDriverPool(datasourceId);
                entry = (await ensureConnectionPoolForUser(userId, organizationId, datasourceId, null)).entry;
                metadata = entry.instance.capabilities.metadata;
            }
        }

        if (!hasMetadataCapability(metadata, 'getFunctionDetail')) {
            return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: 'Function detail metadata is not supported for this connection.' }), {
                status: 404,
            });
        }

        const params = await context.params;
        const functionName = decodeURIComponent(params.functionName);
        const schema = req.nextUrl.searchParams.get('schema');
        const detail = await metadata.getFunctionDetail(database, functionName, schema);

        if (!detail) {
            return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: 'Function was not found.' }), { status: 404 });
        }

        return NextResponse.json(ResponseUtil.success(detail));
    })(req);
}
