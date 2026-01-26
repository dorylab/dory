import { NextRequest, NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolveClickhouseDatasource, handlePrivilegesError } from '../_utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

type TargetOption = {
    label: string;
    value: string;
};

const VIEW_ENGINES = new Set(['VIEW', 'MATERIALIZEDVIEW', 'LIVEVIEW', 'LAZYVIEW', 'WINDOWVIEW']);

function toOption(name: unknown): TargetOption | null {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    return { label: trimmed, value: trimmed };
}

export const GET = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const resolved = await resolveClickhouseDatasource(req, { teamId });
    if (resolved.response) return resolved.response;

    const url = new URL(req.url);
    const type = (url.searchParams.get('type') ?? 'database').toLowerCase();
    const databaseParam = url.searchParams.get('database');

    const instance = resolved.resolved!.instance;

    try {
        if (type === 'database') {
            const result = await instance.query<{ name: string }>('SELECT name FROM system.databases ORDER BY name');
            const options = (result.rows ?? []).map(row => toOption(row.name)).filter((entry): entry is TargetOption => Boolean(entry));
            return NextResponse.json(ResponseUtil.success(options));
        }

        if (type === 'table' || type === 'view') {
            if (!databaseParam) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.BAD_REQUEST,
                        message: translateApi('Api.Privileges.Targets.DatabaseRequired', undefined, locale),
                    }),
                    { status: 400 },
                );
            }
            let database = databaseParam;
            try {
                database = decodeURIComponent(databaseParam);
            } catch {
                database = databaseParam;
            }

            const result = await instance.query<{ name: string; engine: string }>(
                `
                SELECT
                    name,
                    upper(engine) AS engine
                FROM system.tables
                WHERE database = {db:String}
                ORDER BY name
                `,
                { db: database },
            );

            const rows = result.rows ?? [];
            const filtered = rows.filter(row => {
                const engine = row.engine ?? '';
                const isView = VIEW_ENGINES.has(engine.toUpperCase());
                return type === 'view' ? isView : !isView;
            });

            const options = filtered.map(row => toOption(row.name)).filter((entry): entry is TargetOption => Boolean(entry));
            return NextResponse.json(ResponseUtil.success(options));
        }

        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.BAD_REQUEST,
                message: translateApi('Api.Privileges.Targets.UnsupportedType', undefined, locale),
            }),
            { status: 400 },
        );
    } catch (error) {
        return handlePrivilegesError(error, translateApi('Api.Privileges.Targets.FetchFailed', undefined, locale));
    }
});
