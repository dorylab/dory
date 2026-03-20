import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { buildTablePreviewPayload } from '@/lib/connection/table-preview';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';

const buildPreviewSchema = (t: (key: string, values?: Record<string, unknown>) => string) =>
    z.object({
        database: z.string().min(1, t('Api.Connection.Validation.DatabaseRequired')),
        table: z.string().min(1, t('Api.Connection.Validation.TableRequired')),
        limit: z.number().int().positive().max(10000).optional().default(DEFAULT_TABLE_PREVIEW_LIMIT),
        sessionId: z.string().min(1).optional(),
        tabId: z.string().min(1).optional(),
        source: z.string().min(1).optional(),
    });

function safeDecode(value: string | null | undefined) {
    if (!value) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; database: string; table: string }> }) {
    return withUserAndOrganizationHandler(async ({ userId, organizationId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const previewSchema = buildPreviewSchema(t);
        const errorMessages = {
            fallback: t('Api.Connection.Tables.Errors.PreviewFailed'),
            notFound: t('Api.Connection.Errors.NotFound'),
            missingHost: t('Api.Connection.Errors.MissingHost'),
        };

        const params = await context.params;
        const datasourceId = params?.id ?? req.headers.get('x-connection-id');
        if (!datasourceId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        const body = await req.json().catch(() => ({}));
        const parsed = previewSchema.safeParse({
            database: safeDecode(params?.database),
            table: safeDecode(params?.table),
            limit: typeof body?.limit === 'number' ? body.limit : undefined,
            sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
            tabId: typeof body?.tabId === 'string' ? body.tabId : undefined,
            source: typeof body?.source === 'string' ? body.source : undefined,
        });

        if (!parsed.success) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: parsed.error.issues[0]?.message ?? t('Api.Errors.InvalidParams'),
                }),
                { status: 400 },
            );
        }

        const { database, table, limit, sessionId, tabId, source } = parsed.data;

        try {
            const { entry } = await ensureConnectionPoolForUser(userId, organizationId, datasourceId, null);
            const payload = await buildTablePreviewPayload({
                connection: entry.instance,
                connectionId: datasourceId,
                database,
                table,
                limit,
                sessionId,
                tabId,
                userId,
                source,
            });

            return NextResponse.json(ResponseUtil.success(payload));
        } catch (error) {
            console.log('Error fetching table preview:', error);
            return mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            });
        }
    })(req);
}
