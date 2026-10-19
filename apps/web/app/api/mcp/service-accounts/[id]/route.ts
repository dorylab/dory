import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withManagedOrganizationHandler(async ({ db, organizationId }) => {
        const { id } = await context.params;
        const disabled = await db.mcp.disableAgentPrincipal(organizationId, id);
        if (!disabled) return NextResponse.json(ResponseUtil.error({ code: 404, message: 'Agent service account not found.' }), { status: 404 });
        return NextResponse.json(ResponseUtil.success({ disabled: true }));
    })(req);
}
