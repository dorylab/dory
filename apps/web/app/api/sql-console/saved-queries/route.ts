import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { withUserAndOrganizationHandler } from '../../utils/with-organization-handler';
import { handleApiError } from '../../utils/handle-error';
import { parseJsonBody, BadRequestError } from '../../utils/parse-json';
import { getConnectionIdFromRequest } from '@/lib/utils/request';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const createSchema = z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    sqlText: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional().nullable(),
    tags: z.array(z.string()).optional().nullable(),
    workId: z.string().optional().nullable(),
});

const updateSchema = z
    .object({
        id: z.string().optional(),
        title: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        sqlText: z.string().optional().nullable(),
        context: z.record(z.string(), z.unknown()).optional().nullable(),
        tags: z.array(z.string()).optional().nullable(),
        workId: z.string().optional().nullable(),
        archivedAt: z.union([z.string(), z.date()]).optional().nullable(),
        folderId: z.string().optional().nullable(),
        position: z.number().int().optional().nullable(),
    })
    .refine(
        (data) =>
            data.title !== undefined ||
            data.description !== undefined ||
            data.sqlText !== undefined ||
            data.context !== undefined ||
            data.tags !== undefined ||
            data.workId !== undefined ||
            data.archivedAt !== undefined ||
            data.folderId !== undefined ||
            data.position !== undefined,
    );

const normalizeConnectionId = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const requireConnectionId = (req: NextRequest, t: (key: string, values?: Record<string, unknown>) => string) => {
    const connectionId = normalizeConnectionId(getConnectionIdFromRequest(req));
    if (!connectionId) {
        throw new BadRequestError(t('Api.SqlConsole.Tabs.MissingConnectionContext'));
    }
    return connectionId;
};

// GET /api/sql-console/saved-queries?id=xxx&includeArchived=1&limit=50
export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const id = req.nextUrl.searchParams.get('id');
    const includeArchived = req.nextUrl.searchParams.get('includeArchived');
    const limitRaw = req.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const connectionId = requireConnectionId(req, t);

    try {
        if (id) {
            const record = await db.savedQueries.getById({
                organizationId,
                userId,
                id,
                includeArchived: includeArchived === '1' || includeArchived === 'true',
                connectionId,
            });
            if (!record) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.NOT_FOUND,
                        message: t('Api.SqlConsole.SavedQueries.NotFound'),
                    }),
                    { status: 404 },
                );
            }
            return NextResponse.json(ResponseUtil.success(record));
        }

        const list = await db.savedQueries.list({
            organizationId,
            userId,
            includeArchived: includeArchived === '1' || includeArchived === 'true',
            connectionId,
            limit: Number.isFinite(limit) ? limit : undefined,
        });
        return NextResponse.json(ResponseUtil.success(list));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// POST /api/sql-console/saved-queries
export const POST = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    try {
        const payload = await parseJsonBody(req, createSchema);
        const connectionId = requireConnectionId(req, t);
        const created = await db.savedQueries.create({
            ...payload,
            organizationId,
            userId: userId as string,
            connectionId,
        });
        return NextResponse.json(ResponseUtil.success(created), { status: 201 });
    } catch (err: any) {
        return handleApiError(err);
    }
});

// PATCH /api/sql-console/saved-queries?id=xxx
export const PATCH = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    try {
        const payload = await parseJsonBody(req, updateSchema);
        const searchId = req.nextUrl.searchParams.get('id');
        const savedQueryId = searchId ?? payload.id;

        if (!savedQueryId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.SqlConsole.SavedQueries.MissingId'),
                }),
                { status: 400 },
            );
        }

        const connectionId = requireConnectionId(req, t);
        const updated = await db.savedQueries.update({
            organizationId,
            userId: userId as string,
            id: savedQueryId,
            connectionId,
            patch: payload,
        });
        return NextResponse.json(ResponseUtil.success(updated));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// DELETE /api/sql-console/saved-queries?id=xxx
export const DELETE = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    try {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.SqlConsole.SavedQueries.MissingId'),
                }),
                { status: 400 },
            );
        }

        const connectionId = requireConnectionId(req, t);
        await db.savedQueries.delete({ organizationId, userId: userId as string, id, connectionId });
        return NextResponse.json(ResponseUtil.success({ deleted: [id] }));
    } catch (err: any) {
        return handleApiError(err);
    }
});
