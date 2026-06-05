import type { NextRequest } from 'next/server';

import type { ActionContext } from '@dory/actions';
import { getSessionFromRequest } from '@/lib/auth/session';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import type { McpAuthContext } from '@/lib/server/mcp/auth';
import type { WebActionServices } from './types';
import {
    createMcpActionContextFromAuth,
    createUserActionContext,
    parseActionRequestBody,
    type ActionRequestBody,
    type ResolvedActionRequest,
} from './context.shared';
import { resolveDesktopLocalActionSnapshot } from './context.desktop-local';

async function resolveCloudActionRequest(req: NextRequest, body: ActionRequestBody): Promise<ResolvedActionRequest> {
    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;

    if (!userId) {
        throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' });
    }

    const organizationId = body.organizationId ?? resolveCurrentOrganizationId(session);
    if (!organizationId) {
        throw Object.assign(new Error('Missing organization context.'), { status: 401, code: 'MISSING_ORGANIZATION_CONTEXT' });
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!access?.isMember) {
        throw Object.assign(new Error('Forbidden'), { status: 403, code: 'FORBIDDEN' });
    }

    return {
        body,
        ctx: await createUserActionContext({
            req,
            body,
            organizationId,
            userId,
            access,
        }),
    };
}

export async function resolveActionRequest(req: NextRequest): Promise<ResolvedActionRequest> {
    const body = await parseActionRequestBody(req);
    const local = resolveDesktopLocalActionSnapshot(body);

    if (local) {
        return {
            body,
            ctx: await createUserActionContext({
                req,
                body,
                userId: local.userId,
                organizationId: local.organizationId,
                access: local.access,
            }),
        };
    }

    return resolveCloudActionRequest(req, body);
}

export async function createMcpActionContext(context: McpAuthContext): Promise<ActionContext<WebActionServices>> {
    return createMcpActionContextFromAuth(context);
}

export type { ResolvedActionRequest };
