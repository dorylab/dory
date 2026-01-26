
import { bodySchema } from '@/lib/database/postgres/impl/sql-console/tabs/tab-states/zod';
import { getConnectionIdFromRequest } from '@/lib/utils/request';
import { TabResultMetaPayload } from '@/types/tabs';
import { NextResponse } from 'next/server';
import z from 'zod';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export const GET = withUserAndTeamHandler(async ({ req, db, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const connectionId = getConnectionIdFromRequest(req);
    if (!connectionId) {
        return NextResponse.json({ code: 0, message: t('Api.SqlConsole.Tabs.MissingConnectionContext') }, { status: 400 });
    }
    const tabs = await db?.tabState.loadAllTab(userId, connectionId);
    return NextResponse.json({ code: 1, data: tabs });
});


export const POST = withUserAndTeamHandler(async ({ req, db, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);

    if (!parsed.success) {
        return NextResponse.json(
            { code: 0, message: t('Api.Errors.InvalidParams'), error: JSON.parse(parsed.error.message) },
            { status: 400 },
        );
    }

    const { tabId, state, resultMeta } = parsed.data;
    const isTable = state.tabType === 'table';

    if (tabId !== state.tabId) {
        return NextResponse.json(
            { code: 0, message: t('Api.SqlConsole.Tabs.TabIdMismatch') },
            { status: 400 },
        );
    }

    const connectionId = getConnectionIdFromRequest(req);
    if (!connectionId) {
        return NextResponse.json({ code: 0, message: t('Api.SqlConsole.Tabs.MissingConnectionContext') }, { status: 400 });
    }

    if (!db) {
        return NextResponse.json({ code: 0, message: t('Api.SqlConsole.Tabs.DatabaseNotInitialized') }, { status: 500 });
    }


    const result = await db.tabState.saveTabState({
        tabId,
        userId,
        connectionId,
        state: {
            content: isTable ? '' : state.content || null,
            databaseName: isTable ? state.databaseName : undefined,
            tableName: isTable ? state.tableName : undefined,
            activeSubTab: isTable ? state.activeSubTab ?? 'data' : null,
            tabType: state.tabType,
            tabName: state.tabName,
            orderIndex: state.orderIndex,
            createdAt: state.createdAt,
        },
        resultMeta: resultMeta as TabResultMetaPayload,
    })

    return NextResponse.json({ code: 1, result });
});




export const DELETE = withUserAndTeamHandler(async ({ req, db, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const { searchParams } = new URL(req.url);
    const tabId = searchParams.get('tabId');
    if (!tabId) return NextResponse.json({ code: 0, message: t('Api.SqlConsole.Tabs.MissingTabId') }, { status: 400 });

    const connectionId = getConnectionIdFromRequest(req);
    if (!connectionId) {
        return NextResponse.json({ code: 0, message: t('Api.SqlConsole.Tabs.MissingConnectionContext') }, { status: 400 });
    }
    await db?.tabState.deleteTabState(tabId, userId, connectionId);

    return NextResponse.json({ code: 1 });
});


export const PATCH = withUserAndTeamHandler(async ({ req, db, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const schema = z.object({
        tabId: z.string(),
        state: z.any(),
    });

    const body = await req.json();
    const parsed = schema.safeParse(body);
    console.log('PATCH /api/sql-console/tabs body parsed:', parsed);
    if (!parsed.success) {
        return NextResponse.json({ code: 0, message: t('Api.Errors.InvalidParams'), error: parsed.error }, { status: 400 });
    }

    const { tabId, state } = parsed.data;
    const connectionId = getConnectionIdFromRequest(req);
    if (!connectionId) {
        return NextResponse.json({ code: 0, message: t('Api.SqlConsole.Tabs.MissingConnectionContext') }, { status: 400 });
    }
    await db?.tabState.saveTabState({
        tabId,
        userId,
        connectionId,
        state: {
            content: state.content ?? null,
            databaseName: (state as any).databaseName ?? null,
            tableName: (state as any).tableName ?? null,
            activeSubTab: (state as any).activeSubTab ?? null,
            tabType: (state as any).tabType ?? (state as any).type,
            tabName: (state as any).tabName ?? null,
            orderIndex: (state as any).orderIndex,
            createdAt: (state as any).createdAt,
        },
        resultMeta: state.resultMeta ?? null,
    });
    await db?.tabState.updateTabName({ 
        tabId, 
        userId, 
        connectionId,
        newName: state.tabName ?? null,
    });

    return NextResponse.json({ code: 1 });
});
