import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { withUserAndOrganizationHandler } from '../../utils/with-organization-handler';
import { handleApiError } from '../../utils/handle-error';
import { parseJsonBody } from '../../utils/parse-json';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const createSchema = z.object({
    name: z.string().min(1).max(100),
});

const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
}).refine((data) => data.name !== undefined);

// GET /api/sql-console/saved-query-folders
export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, userId }) => {
    try {
        const list = await db.savedQueryFolders.list({ organizationId, userId });
        return NextResponse.json(ResponseUtil.success(list));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// POST /api/sql-console/saved-query-folders
export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    try {
        const payload = await parseJsonBody(req, createSchema);
        const created = await db.savedQueryFolders.create({
            organizationId,
            userId,
            name: payload.name,
        });
        return NextResponse.json(ResponseUtil.success(created), { status: 201 });
    } catch (err: any) {
        return handleApiError(err);
    }
});

// PATCH /api/sql-console/saved-query-folders?id=xxx
export const PATCH = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    try {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.SqlConsole.SavedQueryFolders.MissingId'),
                }),
                { status: 400 },
            );
        }

        const payload = await parseJsonBody(req, updateSchema);
        const updated = await db.savedQueryFolders.update({
            id,
            organizationId,
            userId,
            patch: payload,
        });
        return NextResponse.json(ResponseUtil.success(updated));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// DELETE /api/sql-console/saved-query-folders?id=xxx
export const DELETE = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    try {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.SqlConsole.SavedQueryFolders.MissingId'),
                }),
                { status: 400 },
            );
        }

        await db.savedQueryFolders.delete({ id, organizationId, userId });
        return NextResponse.json(ResponseUtil.success({ deleted: [id] }));
    } catch (err: any) {
        return handleApiError(err);
    }
});
