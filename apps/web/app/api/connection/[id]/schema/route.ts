/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { ensureConnectionPoolForUser } from '../../utils';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const headerId = req.headers.get('x-connection-id');
        const datasourceId = (await context?.params)?.id ?? headerId;

        if (!datasourceId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        try {
            const url = new URL(req.url);
            const databaseParam = url.searchParams.get('database');

            const { entry, config } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);

            const datasource = entry.instance;

            const targetDatabase = databaseParam ?? (typeof config.database === 'string' ? config.database : 'default');

            const schemaSql = `
                SELECT
                    table AS tableName,
                    name AS columnName
                FROM system.columns
                WHERE database = {db:String}
                ORDER BY table, position
            `;

            const result = await datasource.query(schemaSql, { db: targetDatabase });
            const rows = Array.isArray(result.rows) ? (result.rows as any[]) : [];

            const schema: Record<string, string[]> = {};
            for (const row of rows) {
                const table = row.tableName ?? row.table ?? row.TABLE_NAME;
                const column = row.columnName ?? row.column ?? row.COLUMN_NAME;
                if (!table || !column) continue;
                if (!schema[table]) schema[table] = [];
                schema[table].push(column);
            }

            return NextResponse.json({ ok: true, schema });
        } catch (error) {
            console.error('[connection] schema read failed', error);
            return NextResponse.json(
                {
                    ok: false,
                    error: t('Api.Connection.Errors.SchemaReadFailed'),
                },
                { status: 500 },
            );
        }
    })(req);
}
