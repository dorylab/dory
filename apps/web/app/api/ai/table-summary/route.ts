// app/api/ai/table-summary/route.ts
import provider from '@/lib/ai/provider';
import type { TablePropertiesRow } from '@/types/table-info';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale } from '@/app/api/utils/i18n';
import { buildFallbackSummary, buildFallbackDetail, buildFallbackHighlights, buildFallbackSnippets } from '@/lib/ai/core/table-summary';
import { ColumnInput } from '@/types';

export const runtime = 'nodejs'; 

type TableSummaryRequest = {
    database?: string | null;
    table?: string | null;
    columns?: ColumnInput[];
    properties?: TablePropertiesRow | null;
    model?: string | null;

    connectionId?: string;
    catalog?: string | null;
    dbType?: string | null;
    ignoreCache?: boolean;
};

type TableSummarySource = 'cache' | 'ai' | 'fallback';

function createTimer(label: string) {
    const start = Date.now();
    let last = start;

    const stamp = (step: string) => {
        const now = Date.now();
        const stepCost = now - last;
        const total = now - start;
        last = now;
        console.log(`[api/ai/table-summary][time][${label}] ${step}: +${stepCost}ms (total ${total}ms)`);
    };

    const end = () => {
        const now = Date.now();
        console.log(`[api/ai/table-summary][time][${label}] end: total ${now - start}ms`);
    };

    return { stamp, end };
}

export const POST = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const timer = createTimer('POST');
    console.log('[api/ai/table-summary] start');
    timer.stamp(`got teamId=${teamId}`);

    const payload = (await req.json()) as TableSummaryRequest;
    timer.stamp('parsed body');

    const { columns, database, table, properties, model, connectionId, catalog, dbType, ignoreCache } =
        payload || {};
    const colList = Array.isArray(columns) ? columns : [];

    const fallbackPayload = {
        summary: buildFallbackSummary({ database, table, columns: colList, properties, locale }),
        detail: buildFallbackDetail({ database, table, columns: colList, properties, locale }),
        highlights: buildFallbackHighlights(colList, locale),
        snippets: buildFallbackSnippets(table, colList, locale),
    };
    const fallbackResponse = {
        ...fallbackPayload,
        fromCache: false as const,
        source: 'fallback' as TableSummarySource,
    };
    timer.stamp('built fallback payload');

    try {
        if (!colList.length) {
            timer.stamp('no columns, return fallback only');
            timer.end();
            return new Response(
                JSON.stringify(fallbackResponse),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
        }

        
        if (!connectionId) {
            timer.stamp('missing connectionId, return fallback');
            timer.end();
            return new Response(
                JSON.stringify(fallbackResponse),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
        }

        timer.stamp('call getTableSummaryWithCache');

        const result = await provider.getTableSummaryWithCache({
            teamId,
            connectionId,
            columns: colList,
            properties: properties ?? null,
            dbType: dbType ?? null,
            catalog: catalog ?? null,
            database: database ?? null,
            table: table ?? null,
            model: model ?? null,
            ignoreCache: Boolean(ignoreCache),
            locale,
        });

        timer.stamp(`got result (fromCache=${result.fromCache})`);
        timer.end();

        const source: TableSummarySource = result.fromCache ? 'cache' : 'ai';
        const responseBody = { ...result, source };

        return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[api/ai/table-summary] failed:', error);
        timer.stamp('caught error, returning fallback');
        timer.end();
        return new Response(
            JSON.stringify(fallbackResponse),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    }
});
