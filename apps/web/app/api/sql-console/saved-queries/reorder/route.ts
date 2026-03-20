import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ResponseUtil } from '@/lib/result';
import { withUserAndOrganizationHandler } from '../../../utils/with-organization-handler';
import { handleApiError } from '../../../utils/handle-error';
import { parseJsonBody } from '../../../utils/parse-json';

const reorderSchema = z.object({
    folderId: z.string().nullable().optional().default(null),
    orderedIds: z.array(z.string().min(1)).min(1).max(50),
});

// POST /api/sql-console/saved-queries/reorder
export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    try {
        const payload = await parseJsonBody(req, reorderSchema);
        await db.savedQueries.reorder({
            organizationId,
            userId,
            folderId: payload.folderId ?? null,
            orderedIds: payload.orderedIds,
        });
        return NextResponse.json(ResponseUtil.success({ reordered: true }));
    } catch (err: any) {
        return handleApiError(err);
    }
});
