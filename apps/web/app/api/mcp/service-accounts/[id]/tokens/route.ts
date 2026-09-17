import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { generateMcpToken } from '@/lib/server/mcp/auth';
import { serializeMcpToken } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

const bodySchema = z.object({ expiresInDays: z.number().int().positive().max(365).optional() });

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withManagedOrganizationHandler(async ({ db, organizationId, userId }) => {
        const { id } = await context.params;
        const principal = await db.mcp.getAgentPrincipal(organizationId, id);
        if (!principal?.enabled) return NextResponse.json(ResponseUtil.error({ code: 404, message: 'Agent service account not found.' }), { status: 404 });
        const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) return NextResponse.json(ResponseUtil.error({ code: 400, message: parsed.error.issues[0]?.message ?? 'Invalid token.' }), { status: 400 });
        const generated = generateMcpToken();
        const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000) : null;
        const token = await db.mcp.rotateAgentPrincipalToken({
            organizationId,
            name: principal.name,
            tokenPrefix: generated.tokenPrefix,
            tokenHash: generated.tokenHash,
            scopes: ['assets:read', 'knowledge:read'],
            createdByUserId: userId,
            principalType: 'service',
            principalId: principal.id,
            allowedConnectionIds: principal.allowedConnectionIds,
            expiresAt,
        });
        return NextResponse.json(ResponseUtil.success({ token: generated.token, tokenRecord: serializeMcpToken(token) }), { status: 201 });
    })(req);
}
