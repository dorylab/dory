import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import type { ClickhouseDatasource } from '@/lib/connection/drivers/clickhouse/ClickhouseDatasource';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const paramsSchema = z.object({
    database: z.string().min(1),
});

const querySchema = z.object({
    catalog: z.string().optional(),
    schema: z.string().optional(),
});

const databaseSummarySchema = z.object({
    databaseName: z.string(),
    catalogName: z.string().nullable(),
    schemaName: z.string().nullable(),
    engine: z.enum(['clickhouse', 'doris', 'mysql', 'unknown']),
    cluster: z.string().nullable(),
    tablesCount: z.number().nullable(),
    viewsCount: z.number().nullable(),
    materializedViewsCount: z.number().nullable(),
    totalBytes: z.number().nullable(),
    totalRowsEstimate: z.number().nullable(),
    lastUpdatedAt: z.string().nullable(),
    lastQueriedAt: z.string().nullable(),
    topTablesByBytes: z
        .array(
            z.object({
                name: z.string(),
                bytes: z.number().nullable(),
                rowsEstimate: z.number().nullable(),
                comment: z.string().nullable(),
            }),
        )
        .max(5),
    topTablesByRows: z
        .array(
            z.object({
                name: z.string(),
                bytes: z.number().nullable(),
                rowsEstimate: z.number().nullable(),
                comment: z.string().nullable(),
            }),
        )
        .max(5),
    recentTables: z
        .array(
            z.object({
                name: z.string(),
                lastUpdatedAt: z.string().nullable(),
            }),
        )
        .max(5),
    oneLineSummary: z.string().nullable(),
});

function decodeParam(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export async function GET(req: NextRequest, context: { params: Promise<{ database: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const connectionId = req.headers.get(X_CONNECTION_ID_KEY);
        if (!connectionId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        const parsedParams = paramsSchema.safeParse(await context.params);
        if (!parsedParams.success) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Validation.DatabaseRequired') }),
                { status: 400 },
            );
        }

        const databaseName = decodeParam(parsedParams.data.database);
        const url = new URL(req.url);
        const parsedQuery = querySchema.safeParse({
            catalog: url.searchParams.get('catalog') ?? undefined,
            schema: url.searchParams.get('schema') ?? undefined,
        });

        const catalogName = parsedQuery.success ? parsedQuery.data.catalog ?? null : null;
        const schemaName = parsedQuery.success ? parsedQuery.data.schema ?? null : null;

        try {
            const { entry, config } = await ensureConnectionPoolForUser(userId, teamId, connectionId, null);
            const engine = (config.type ?? 'unknown') as 'clickhouse' | 'doris' | 'mysql' | 'unknown';
            const cluster = config.port ? `${config.host}:${config.port}` : config.host ?? null;

            const instance = entry.instance as ClickhouseDatasource;
            const summary = await instance.getDatabaseSummary({
                database: databaseName,
                catalogName,
                schemaName,
                engine,
                cluster,
            });
            const responsePayload = { ...summary, oneLineSummary: summary.oneLineSummary ?? null };
            const parsed = databaseSummarySchema.parse(responsePayload);
            return NextResponse.json(ResponseUtil.success(parsed));
        } catch (error) {
            console.error('Error fetching database summary:', error);
            return mapConnectionErrorToResponse(error, {
                notFound: t('Api.Connection.Errors.NotFound'),
                missingHost: t('Api.Connection.Errors.MissingHost'),
                fallback: t('Api.Connection.Databases.Errors.SummaryFailed'),
            });
        }
    })(req);
}
