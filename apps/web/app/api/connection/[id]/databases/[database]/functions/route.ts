/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { resolveCatalogContext } from '../../_utils';
import { hasMetadataCapability } from '@/lib/connection/base/types';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export async function GET(req: NextRequest, context: { params: Promise<{ database: string }> }) {
    return withUserAndOrganizationHandler(async ({ userId, organizationId }) => {
        const resolved = await resolveCatalogContext(req, context, { userId, organizationId });
        if (resolved.response) return resolved.response;

        const { entry, database } = resolved.resolved!;
        const metadata = entry.instance.capabilities.metadata;
        const functions = hasMetadataCapability(metadata, 'getFunctions') ? await metadata.getFunctions(database) : [];

        return NextResponse.json(ResponseUtil.success(functions));
    })(req);
}
