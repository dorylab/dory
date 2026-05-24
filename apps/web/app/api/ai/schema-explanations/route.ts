// app/api/ai/schema-explanations/route.ts
import { z } from 'zod';
import provider from '@/lib/ai/provider';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { fallbackSummaries } from '@/lib/ai/core/schema-explanations';
import { isAiQuotaExceededError, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import { resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';

export const runtime = 'nodejs';

const schemaExplanationRequestSchema = z.object({
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

    connectionId: z.string().min(1),
    catalog: z.string().nullable().optional(),
    dbType: z.string(),
});

type SchemaExplanationRequest = z.infer<typeof schemaExplanationRequestSchema>;

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const execution = await resolveAiRouteExecution({
        req,
        db,
        organizationId,
        role: 'schema_explanation',
        includeModel: false,
        proxy: {
            pathname: '/api/ai/schema-explanations',
        },
    });
    if (execution.proxiedResponse) return execution.proxiedResponse;

    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const payload = await req.json().catch(() => null);

    const parsed = schemaExplanationRequestSchema.safeParse(payload);

    if (!parsed.success) {
        return new Response(
            JSON.stringify({
                message: t('Api.Ai.SchemaExplanations.InvalidParams'),
                issues: parsed.error.flatten(),
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const { columns, database, table, model, connectionId, catalog, dbType } = parsed.data;

    try {
        const result = await provider.getColumnExplanationsWithCache({
            organizationId,
            userId,
            connectionId,
            dbType,
            catalog,
            database,
            table,
            columns,
            model,
            locale,
        });

        // result: { columns, raw?, fromCache }
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        if (isAiQuotaExceededError(error)) {
            return toAiQuotaExceededResponse(error);
        }

        console.error('[api/ai/schema-explanations] failed:', error);
        const fallback = fallbackSummaries(columns, locale);
        return new Response(
            JSON.stringify({
                columns: fallback,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    }
});
