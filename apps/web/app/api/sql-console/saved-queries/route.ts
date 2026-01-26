import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { withUserAndTeamHandler } from '../../utils/with-team-handler';
import { handleApiError } from '../../utils/handle-error';
import { parseJsonBody } from '../../utils/parse-json';
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
    })
    .refine(
        (data) =>
            data.title !== undefined ||
            data.description !== undefined ||
            data.sqlText !== undefined ||
            data.context !== undefined ||
            data.tags !== undefined ||
            data.workId !== undefined ||
            data.archivedAt !== undefined,
    );

// GET /api/sql-console/saved-queries?id=xxx&includeArchived=1&limit=50
export const GET = withUserAndTeamHandler(async ({ req, db, teamId, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const id = req.nextUrl.searchParams.get('id');
    const includeArchived = req.nextUrl.searchParams.get('includeArchived');
    const limitRaw = req.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;

    try {
        if (id) {
            const record = await db.savedQueries.getById({
                teamId,
                userId,
                id,
                includeArchived: includeArchived === '1' || includeArchived === 'true',
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
            teamId,
            userId,
            includeArchived: includeArchived === '1' || includeArchived === 'true',
            limit: Number.isFinite(limit) ? limit : undefined,
        });
        return NextResponse.json(ResponseUtil.success(list));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// POST /api/sql-console/saved-queries
export const POST = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    try {
        const payload = await parseJsonBody(req, createSchema);
        const created = await db.savedQueries.create({
            ...payload,
            teamId,
            userId: userId as string,
        });
        return NextResponse.json(ResponseUtil.success(created), { status: 201 });
    } catch (err: any) {
        return handleApiError(err);
    }
});

// PATCH /api/sql-console/saved-queries?id=xxx
export const PATCH = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
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

        const updated = await db.savedQueries.update({
            teamId,
            userId: userId as string,
            id: savedQueryId,
            patch: payload,
        });
        return NextResponse.json(ResponseUtil.success(updated));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// DELETE /api/sql-console/saved-queries?id=xxx
export const DELETE = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
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

        await db.savedQueries.delete({ teamId, userId: userId as string, id });
        return NextResponse.json(ResponseUtil.success({ deleted: [id] }));
    } catch (err: any) {
        return handleApiError(err);
    }
});
