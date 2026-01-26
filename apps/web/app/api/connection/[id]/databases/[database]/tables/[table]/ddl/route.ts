/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const buildTableDdlSchema = (t: (key: string) => string) =>
    z.object({
        database: z.string().min(1, t('Api.Connection.Validation.DatabaseRequired')),
        table: z.string().min(1, t('Api.Connection.Validation.TableRequired')),
    });

export async function GET(req: NextRequest, context: { params: Promise<{ id: string; database: string; table: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const tableDdlSchema = buildTableDdlSchema(t);
        const errorMessages = {
            fallback: t('Api.Connection.Tables.Errors.DdlFailed'),
            notFound: t('Api.Connection.Errors.NotFound'),
            missingHost: t('Api.Connection.Errors.MissingHost'),
        };
        const headerId = req.headers.get('x-connection-id');
        const datasourceId = (await context?.params)?.id ?? headerId;
        const databaseParam = (await context?.params)?.database;
        const tableParam = (await context?.params)?.table;

        if (!datasourceId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        const safeDecode = (value: string | null | undefined) => {
            if (!value) return value;
            try {
                return decodeURIComponent(value);
            } catch {
                return value;
            }
        };

        const parsed = tableDdlSchema.safeParse({
            database: safeDecode(databaseParam),
            table: safeDecode(tableParam),
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

        const { database, table } = parsed.data;

        try {
            const { entry } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);
            const ddl = await entry.instance.getTableInfo.ddl(database, table);
            return NextResponse.json(ResponseUtil.success<string | null>(ddl));
        } catch (error) {
            console.log('Error in GET table DDL route:', error);
            return mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            });
        }
    })(req);
}
