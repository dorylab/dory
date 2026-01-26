/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import z from 'zod';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const buildColumnSchema = (t: (key: string) => string) =>
    z.object({
        database: z.string().min(1, t('Api.Connection.Validation.DatabaseRequired')),
        table: z.string().min(1, t('Api.Connection.Validation.TableRequired')),
    });

export async function GET(req: NextRequest, context: { params: Promise<{ id: string; database: string; table: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const columnSchema = buildColumnSchema(t);
        const errorMessages = {
            fallback: t('Api.Connection.Tables.Errors.ColumnsFailed'),
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

        const parsed = columnSchema.safeParse({
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

            const columnsQuery = `
                SELECT
                    name AS columnName,
                    type AS columnType,
                    default_kind AS defaultKind,
                    default_expression AS defaultExpression,
                    is_in_primary_key AS isPrimaryKey,
                    comment
                FROM system.columns
                WHERE database = {db:String}
                  AND table = {tbl:String}
                ORDER BY position
            `;

            const result = await entry.instance.query(columnsQuery, { db: database, tbl: table });
            const rows = Array.isArray(result.rows) ? (result.rows as any[]) : [];

            return NextResponse.json(ResponseUtil.success(rows));
        } catch (error) {
            console.log('Error fetching columns:', error);
            return mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            });
        }
    })(req);
}
