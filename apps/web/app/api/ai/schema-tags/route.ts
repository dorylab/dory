import { NextResponse } from 'next/server';
import { z } from 'zod';
import provider from '@/lib/ai/provider';
import { heuristicTagging } from '@/lib/ai/core/column-tagging';
import { getConnectionIdFromRequest } from '@/lib/utils/request';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export const runtime = 'nodejs'; 

const schemaTagRequestSchema = z.object({
    columns: z
        .array(
            z.object({
                name: z.string().min(1),
                type: z.string().optional(),
                comment: z.string().nullable().optional(),
                defaultValue: z.string().nullable().optional(),
                nullable: z.boolean().optional(),
            }),
        )
        .min(1),
    database: z.string().nullable().optional(),
    table: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    catalog: z.string().nullable().optional(),
    dbType: z.string(),
});

type SchemaTagRequest = z.infer<typeof schemaTagRequestSchema>;

export const POST = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const payload = await req.json().catch(() => null);

    const parsed = schemaTagRequestSchema.safeParse(payload);

    if (!parsed.success) {
        return new Response(
            JSON.stringify({
                message: t('Ai.SchemaTags.InvalidParams'),
                issues: parsed.error.flatten(),
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const {
        columns,
        database,
        table,
        model,
        catalog,
        dbType,
    } = parsed.data as SchemaTagRequest;

    const connectionId = getConnectionIdFromRequest(req);
    if (!connectionId) {
        return NextResponse.json({ code: 0, message: t('Ai.SchemaTags.MissingConnectionContext') }, { status: 400 });
    }

    try {
        const result = await provider.getColumnTagsWithCache({
            teamId,
            connectionId,
            columns,
            dbType,
            catalog,
            database,
            table,
            model,
            locale,
        });

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[api/ai/schema-tags] failed:', error);
        const fallback = heuristicTagging(columns, locale);
        return new Response(
            JSON.stringify({
                columns: fallback,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    }
});
