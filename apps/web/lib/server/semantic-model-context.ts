import { resolveKnowledgeAnalysisRules } from './knowledge-analysis-rules';
import 'server-only';
import { resolveKnowledgeAccess, type KnowledgeScope } from './knowledge-access';

import type { DBService } from '@dory/database';
export type SemanticModelUsage = {
    id: string;
    name: string;
    modelRevision: string;
    rulesRef: string;
    deepLink: string;
};

export type SemanticModelContextResult = {
    context: string | null;
    models: SemanticModelUsage[];
    reviewSources?: import('./knowledge-definition-review').DefinitionSource[];
};

export async function resolveSemanticModelContext(
    db: DBService,
    input: { organizationId: string; scope: KnowledgeScope; allowedConnectionIds?: string[] | null; deferRules?: boolean; review?: boolean },
): Promise<SemanticModelContextResult> {
    const access = resolveKnowledgeAccess(input.scope, input.allowedConnectionIds ?? null);
    return resolveKnowledgeAnalysisRules(
        db.knowledge,
        input.organizationId,
        access,
        !input.deferRules && Boolean(access.modelId || input.scope.connectionIds?.length),
        input.review,
    );
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
                assetKind: 'knowledge_source',
                assetRef: model.rulesRef,
                revision: model.modelRevision,
                assetSnapshot: {
                    title: model.name + ' · RULES.md',
                    knowledgeModelId: model.id,
                    knowledgeModelName: model.name,
                    modelRevision: model.modelRevision,
                    deepLink: model.deepLink,
                },
            },
            {
                tokenId: input.tokenId ?? null,
                connectionId: input.connectionId ?? null,
                toolName: 'knowledge_rules_loaded',
                actionId: 'knowledge.analysisRules',
                status: 'success',
                inputSummary: { knowledgeModelId: model.id, ...(input.requestId ? { requestId: input.requestId } : {}) },
                outputSummary: {
                    modelRevision: model.modelRevision,
                    title: model.name + ' · RULES.md',
                    deepLink: model.deepLink,
                },
            },
        );
    }
}
