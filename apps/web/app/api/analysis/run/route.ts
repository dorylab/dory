import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale } from '@/app/api/utils/i18n';
import { ensureConnection } from '@/lib/server/ensure-connection';
import { ResponseUtil } from '@/lib/result';
import { runAnalysis } from '@/lib/server/analysis/run-analysis';
import { ErrorCodes } from '@dory/shared/errors';

export const runtime = 'nodejs';

const resultContextSchema = z.object({
    resultSetId: z.object({
        sessionId: z.string().min(1),
        setIndex: z.number().int().min(0),
    }),
    sqlText: z.string().optional(),
    databaseName: z.string().nullable().optional(),
    tableRefs: z.array(
        z.object({
            database: z.string().optional(),
            table: z.string().min(1),
            confidence: z.enum(['high', 'medium', 'low']),
        }),
    ),
    rowCount: z.number().int().min(0),
    columns: z.array(
        z.object({
            name: z.string().min(1),
            dataType: z.string().min(1),
            semanticType: z.enum(['time', 'dimension', 'measure', 'identifier']).optional(),
            distinctRatio: z.number().nullable().optional(),
            entropy: z.number().nullable().optional(),
            topValueShare: z.number().nullable().optional(),
            informationDensity: z.enum(['none', 'low', 'medium', 'high']).optional(),
        }),
    ),
});

const insightSchema = z.object({
    decision: z.object({
        title: z.string(),
        impact: z.string(),
        mainFinding: z
            .object({
                title: z.string(),
                summary: z.string(),
                recommendation: z.string(),
                action: z.object({}).passthrough().optional(),
            })
            .optional(),
        items: z.array(
            z.object({
                id: z.string(),
                title: z.string(),
                summary: z.string(),
                level: z.enum(['primary', 'secondary', 'info']),
                severity: z.enum(['info', 'warning', 'critical']),
                confidence: z.enum(['high', 'medium', 'low']),
                primaryAction: z.object({}).passthrough().optional(),
                actions: z.array(z.object({}).passthrough()),
            }),
        ),
    }),
    signals: z.array(z.object({}).passthrough()),
    findings: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            summary: z.string(),
            level: z.enum(['primary', 'secondary', 'info']),
            severity: z.enum(['info', 'warning', 'critical']),
            confidence: z.enum(['high', 'medium', 'low']),
            primaryAction: z.object({}).passthrough().optional(),
            actions: z.array(z.object({}).passthrough()),
        }),
    ),
    narrative: z.string(),
});

const resultActionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('filter'),
        title: z.string().min(1),
        params: z.object({
            column: z.string().min(1),
            operator: z.enum(['>', '<', '=', '>=', '<=']),
            value: z.union([z.number(), z.string()]),
        }),
    }),
    z.object({
        type: z.literal('group'),
        title: z.string().min(1),
        params: z.object({
            dimensions: z.array(z.string().min(1)).min(1),
            measure: z
                .object({
                    column: z.string().min(1),
                    aggregation: z.enum(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']),
                })
                .optional(),
            limit: z.number().int().positive().optional(),
        }),
    }),
    z.object({
        type: z.literal('trend'),
        title: z.string().min(1),
        params: z.object({
            timeColumn: z.string().min(1),
            measure: z
                .object({
                    column: z.string().min(1),
                    aggregation: z.enum(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']),
                })
                .optional(),
            limit: z.number().int().positive().optional(),
        }),
    }),
    z.object({
        type: z.literal('distribution'),
        title: z.string().min(1),
        params: z.object({
            column: z.string().min(1),
        }),
    }),
]);

const bodySchema = z.object({
    context: z.object({
        connectionId: z.string().min(1),
        databaseName: z.string().nullable().optional(),
        resultRef: z.object({
            sessionId: z.string().min(1),
            setIndex: z.number().int().min(0),
        }),
        resultContext: resultContextSchema,
        insight: insightSchema,
    }),
    trigger: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('suggestion'),
            suggestionId: z.string().min(1),
            sqlPreview: z.string().nullable().optional(),
            action: resultActionSchema.nullable().optional(),
        }),
        z.object({
            type: z.literal('followup'),
            sourceSessionId: z.string().min(1),
            suggestionId: z.string().min(1),
            sqlPreview: z.string().nullable().optional(),
            action: resultActionSchema.nullable().optional(),
        }),
    ]),
    tabId: z.string().min(1).optional(),
});

export const POST = withUserAndOrganizationHandler(async ({ req, organizationId, userId }) => {
    const locale = await getApiLocale();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? 'Invalid analysis request.',
            }),
            { status: 400 },
        );
    }

    const ensured = await ensureConnection(req, {
        organizationId,
    });
    if ('response' in ensured) {
        return ensured.response;
    }

    const result = await runAnalysis({
        request: {
            context: parsed.data.context as any,
            trigger: parsed.data.trigger,
        },
        connection: ensured,
        connectionId: parsed.data.context.connectionId,
        tabId: parsed.data.tabId ?? null,
        locale,
        organizationId,
        userId,
    });

    return NextResponse.json(ResponseUtil.success(result), {
        status: 200,
    });
});
