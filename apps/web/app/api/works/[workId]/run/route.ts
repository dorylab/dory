import 'server-only';

import type { NextRequest } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { runWorkAgent } from '@/lib/server/work/run-agent';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const { pathname } = new URL(req.url);
    const parts = pathname.split('/').filter(Boolean);
    const workId = parts[parts.length - 2];

    if (!workId) {
        return Response.json({ error: 'Missing work id.' }, { status: 400 });
    }

    return runWorkAgent({
        req: req as NextRequest,
        db,
        organizationId,
        userId,
        workId,
    });
});
