import type { ActionContext } from '@dory/actions';
import type { DBService } from '@dory/database';
import type { ExtractedKnowledge } from '@dory/database/postgres/schemas/knowledge-extraction';

import { actionOperationContext } from '@/lib/actions/server/operation-context';
import type { WebActionServices } from '@/lib/actions/server/types';
import { describeTableOperation } from '@/lib/ai/tools/dory-tool-operations';
import { ensureConnectionPoolForOrganization } from '@/lib/connection/utils';

import { validateMetricReferences } from './knowledge-metric-references';

export async function validateMetricMapping(ctx: ActionContext<WebActionServices>, knowledgeModelId: string, payload: ExtractedKnowledge) {
    return validateMetricMappingWithService(ctx.services.db, ctx.organizationId, knowledgeModelId, payload, async (connectionId, database, table) =>
        (await describeTableOperation(actionOperationContext(ctx, 'dory_schema_metadata'), { connectionId, database, table })).columns.map(c => c.columnName),
    );
}

export async function validateMetricMappingWithService(
    db: DBService,
    organizationId: string,
    knowledgeModelId: string,
    payload: ExtractedKnowledge,
    readColumns = async (connectionId: string, database: string, table: string) => {
        const { entry } = await ensureConnectionPoolForOrganization(organizationId, connectionId);
        return (await entry.instance.describeTable(database, table)).map(c => c.columnName);
    },
) {
    if (payload.kind !== 'metric') return;
    const model = await db.knowledge.getModel({ organizationId, knowledgeModelId });
    if (!payload.sourceConnectionId || !model.dataSources.some(s => s.connectionId === payload.sourceConnectionId))
        throw new Error('Select a model data source before approving this metric.');
    const expressions = [payload.expression, payload.timeDimension, ...(payload.filters ?? [])].filter((x): x is string => Boolean(x));
    if (!payload.source && !expressions.length) return; // A reviewed textual definition can be published without an executable mapping.
    if (!payload.source) throw new Error('Specify the source table before approving field expressions.');
    const record = await db.connections.getById(organizationId, payload.sourceConnectionId);
    const database = record?.connection.database;
    if (!database) throw new Error('Configure a database for the selected data source before validating its fields.');
    const columns = await readColumns(payload.sourceConnectionId, database, payload.source);
    if (!columns.length) throw new Error('The source table has no available Schema metadata.');
    validateMetricReferences(expressions, payload.source, columns);
}
