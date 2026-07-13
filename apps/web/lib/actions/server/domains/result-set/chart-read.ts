import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { resultSetOperationsSchema } from './schemas';

const inputSchema = z.object({
    resultSetId: z.string().min(1),
    xKey: z.string().min(1),
    yKey: z.string().min(1),
    groupKey: z.string().nullable().optional(),
    chartType: z.string().nullable().optional(),
    filters: resultSetOperationsSchema.filters,
    search: resultSetOperationsSchema.search,
});

const outputSchema = z.object({
    data: z.array(z.record(z.string(), z.unknown())),
    series: z.array(
        z.object({
            key: z.string(),
            label: z.string(),
        }),
    ),
    bucketHint: z.string().nullable().optional(),
});

export const resultSetChartReadAction = defineWebAction({
    id: 'resultSet.chart.read',
    domain: 'resultSet',
    kind: 'query',
    risk: 'read',
    inputSchema,
    outputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            automation: 'automation_sql',
        },
        allowInputFields: ['resultSetId', 'xKey', 'yKey', 'groupKey', 'chartType', 'filters', 'search'],
    },
    handler: (ctx, input) =>
        ctx.services.db.resultSets.readChart({
            organizationId: ctx.organizationId,
            resultSetId: input.resultSetId,
            xKey: input.xKey,
            yKey: input.yKey,
            groupKey: input.groupKey,
            chartType: input.chartType,
            filters: input.filters,
            search: input.search,
        }),
});
