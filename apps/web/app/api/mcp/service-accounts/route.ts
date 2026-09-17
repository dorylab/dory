import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { generateMcpToken } from '@/lib/server/mcp/auth';
import { serializeAgentPrincipal, serializeMcpToken } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

const bodySchema = z.object({
    name: z.string().trim().min(1).max(80),
    allowedConnectionIds: z.array(z.string().min(1)).max(100).optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
});

export const POST = withManagedOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json(ResponseUtil.error({ code: 400, message: parsed.error.issues[0]?.message ?? 'Invalid service account.' }), { status: 400 });

    const principal = await db.mcp.createAgentPrincipal({
        organizationId,
        name: parsed.data.name,
        allowedConnectionIds: parsed.data.allowedConnectionIds,
        createdByUserId: userId,
    });
    const generated = generateMcpToken();
    const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000) : null;
    const token = await db.mcp.createToken({
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
    return NextResponse.json(ResponseUtil.success({ principal: serializeAgentPrincipal(principal), token: generated.token, tokenRecord: serializeMcpToken(token) }), {
        status: 201,
    });
});
