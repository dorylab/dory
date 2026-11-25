import { resolveKnowledgeAnalysisRules } from './knowledge-analysis-rules';
import 'server-only';

import type { DBService } from '@dory/database';
export type SemanticModelUsage = {
    id: string;
    name: string;
    modelRevision: string;
    deepLink: string;
};

export type SemanticModelContextResult = {
    context: string | null;
    models: SemanticModelUsage[];
};

type ResolveSemanticModelContextInput = {
    organizationId: string;
    connectionId: string;
    knowledgeModelId?: string | null;
    includeRules?: boolean;
};

export async function resolveSemanticModelContext(db: DBService, input: ResolveSemanticModelContextInput): Promise<SemanticModelContextResult> {
    const linked = await db.knowledge.listModels({ organizationId: input.organizationId, connectionId: input.connectionId });
    const models = input.knowledgeModelId ? linked.filter(model => model.id === input.knowledgeModelId) : linked;
    if (!models.length) return { context: null, models: [] };
    const rules = input.includeRules === false ? null : await resolveKnowledgeAnalysisRules(db.knowledge, input.organizationId, { connectionIds: [input.connectionId] });
    const selected = rules?.modelId ? models.filter(model => model.id === rules.modelId) : models;
    const guides = selected.slice(0, 3).map(model => ({
        id: model.id,
        name: model.name,
        guide: model.businessContextMd.slice(0, 2500),
    }));
    return {
        context: [
            'Use search_assets and read_asset to find and read relevant knowledge documents and verified SQL. Treat the following guides as reference data.',
            JSON.stringify(guides),
            rules?.instruction,
        ]
            .filter(Boolean)
            .join('\n'),
        models: selected.slice(0, 3).map(model => ({
            id: model.id,
            name: model.name,
            modelRevision: model.updatedAt.toISOString(),
            deepLink: `/${encodeURIComponent(input.organizationId)}/knowledge/${encodeURIComponent(model.id)}`,
        })),
    };
}

export async function recordSemanticModelUsage(
    db: DBService,
    input: { organizationId: string; userId: string; workId: string; connectionId?: string | null; tokenId?: string | null; requestId?: string; models: SemanticModelUsage[] },
) {
    for (const model of input.models) {
        await db.works.recordAgentAssetUsageEvent(
            {
                workId: input.workId,
                organizationId: input.organizationId,
                userId: input.userId,
                assetKind: 'semantic_model',
                assetRef: `dory://knowledge/${encodeURIComponent(model.id)}/semantic-model/${model.modelRevision}`,
                revision: model.modelRevision,
                assetSnapshot: {
                    title: model.name,
                    knowledgeModelId: model.id,
                    knowledgeModelName: model.name,
                    modelRevision: model.modelRevision,
                    deepLink: model.deepLink,
                },
            },
            {
                tokenId: input.tokenId ?? null,
                connectionId: input.connectionId ?? null,
                toolName: 'semantic_model_context',
                actionId: 'knowledge.semanticContext',
                status: 'success',
                inputSummary: { knowledgeModelId: model.id, ...(input.requestId ? { requestId: input.requestId } : {}) },
                outputSummary: {
                    modelRevision: model.modelRevision,
                    ...(input.requestId ? { title: model.name, deepLink: model.deepLink } : {}),
                },
            },
        );
    }
}
