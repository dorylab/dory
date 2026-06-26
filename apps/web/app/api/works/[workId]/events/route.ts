import { NextResponse, type NextRequest } from 'next/server';
import { getDBService } from '@dory/database';
import { ErrorCodes } from '@dory/shared/errors';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { ResponseUtil } from '@/lib/result';
import { resolveOrganizationAccess } from '@/lib/server/authz';

export const runtime = 'nodejs';

const ALLOWED_HUMAN_WORK_EVENT = 'dory_user_save_workspace';

function numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function stringValue(value: unknown) {
    return typeof value === 'string' ? value : null;
}

function booleanValue(value: unknown) {
    return typeof value === 'boolean' ? value : false;
}

function stringArrayValue(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8) : [];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ workId: string }> }) {
    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);

    if (!userId || !organizationId) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized.' }), { status: 401 });
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!access?.isMember || !access.permissions.workspace.write) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.FORBIDDEN, message: 'Forbidden.' }), { status: 403 });
    }

    const workId = (await ctx.params).workId;
    if (!workId) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.VALIDATION_ERROR, message: 'Missing workId.' }), { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const toolName = stringValue(body?.toolName);
    const operation = stringValue(body?.operation);

    if (toolName !== ALLOWED_HUMAN_WORK_EVENT || operation !== 'save_workspace') {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.VALIDATION_ERROR, message: 'Unsupported work event.' }), { status: 400 });
    }

    const db = await getDBService();
    const snapshot = await db.works.getSnapshot({ organizationId, userId, workId });
    if (!snapshot) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: 'Work not found.' }), { status: 404 });
    }

    const tabCount = numberValue(body?.tabCount);
    const sqlTabCount = numberValue(body?.sqlTabCount);
    const tableTabCount = numberValue(body?.tableTabCount);
    const changed = booleanValue(body?.changed);
    const changeSummary = stringArrayValue(body?.changeSummary);
    const actorName = session?.user.name || session?.user.email || userId;
    const event = await db.works.recordEvent({
        workId,
        organizationId,
        userId,
        connectionId: snapshot.work.connectionId ?? null,
        toolName: ALLOWED_HUMAN_WORK_EVENT,
        status: 'success',
        inputSummary: {
            operation: 'save_workspace',
            workspaceMode: 'agent',
            tabCount,
            actorName,
            actorUserId: userId,
        },
        outputSummary: {
            tabCount,
            sqlTabCount,
            tableTabCount,
            changed,
            changeSummary,
            addedTabCount: numberValue(body?.addedTabCount),
            removedTabCount: numberValue(body?.removedTabCount),
            renamedTabCount: numberValue(body?.renamedTabCount),
            editedSqlTabCount: numberValue(body?.editedSqlTabCount),
            updatedTableTabCount: numberValue(body?.updatedTableTabCount),
            reordered: booleanValue(body?.reordered),
            actorName,
            actorUserId: userId,
        },
    });

    return NextResponse.json(ResponseUtil.success({ eventId: event.eventId }));
}
