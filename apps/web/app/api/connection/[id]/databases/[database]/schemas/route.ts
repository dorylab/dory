import { NextRequest, NextResponse } from 'next/server';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { resolveCatalogContext } from '../../_utils';
import { DatabaseMeta, hasMetadataCapability } from '@/lib/connection/base/types';
import { ResponseUtil } from '@/lib/result';

export async function GET(req: NextRequest, context: { params: Promise<{ database: string }> }) {
    return withUserAndOrganizationHandler(async ({ userId, organizationId }) => {
        const resolved = await resolveCatalogContext(req, context, { userId, organizationId });
        if (resolved.response) {
            return resolved.response;
        }

        const catalogContext = resolved.resolved;
        if (!catalogContext) {
            return NextResponse.json(ResponseUtil.success<DatabaseMeta[]>([]));
        }

        const metadata = catalogContext.entry.instance.capabilities.metadata;
        if (!hasMetadataCapability(metadata, 'getSchemas')) {
            return NextResponse.json(ResponseUtil.success<DatabaseMeta[]>([]));
        }

        const schemas = await metadata.getSchemas(catalogContext.database);
        return NextResponse.json(ResponseUtil.success<DatabaseMeta[]>(schemas));
    })(req);
}
