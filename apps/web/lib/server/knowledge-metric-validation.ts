import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from '@/lib/actions/server/types';
import { actionOperationContext } from '@/lib/actions/server/operation-context';
import { describeTableOperation } from '@/lib/ai/tools/dory-tool-operations';
import type { ExtractedKnowledge } from '@dory/database/postgres/schemas/knowledge-extraction';

import { validateMetricReferences } from './knowledge-metric-references';

export async function validateMetricMapping(ctx: ActionContext<WebActionServices>, knowledgeModelId: string, payload: ExtractedKnowledge) {
    if (payload.kind !== 'metric') return;
    const model = await ctx.services.db.knowledge.getModel({ organizationId: ctx.organizationId, knowledgeModelId });
    if (!payload.sourceConnectionId || !model.dataSources.some(s => s.connectionId === payload.sourceConnectionId))
        throw new Error('Select a model data source before approving this metric.');
    const expressions = [payload.expression, payload.timeDimension, ...(payload.filters ?? [])].filter((x): x is string => Boolean(x));
    if (!payload.source && !expressions.length) return; // A reviewed textual definition can be published without an executable mapping.
    if (!payload.source) throw new Error('Specify the source table before approving field expressions.');
    const record = await ctx.services.db.connections.getById(ctx.organizationId, payload.sourceConnectionId);
    const database = record?.connection.database;
    if (!database) throw new Error('Configure a database for the selected data source before validating its fields.');
    const result = await describeTableOperation(actionOperationContext(ctx, 'dory_schema_metadata'), { connectionId: payload.sourceConnectionId, database, table: payload.source });
    if (!result.columns.length) throw new Error('The source table has no available Schema metadata.');
    validateMetricReferences(
        expressions,
        payload.source,
        result.columns.map(column => column.columnName),
    );
}
