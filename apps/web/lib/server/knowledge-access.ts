import type { AnalysisScope } from '@dory/shared/types/work-document';

export type KnowledgeScope = Pick<AnalysisScope, 'knowledgeMode' | 'knowledgeModelId'> & { connectionIds?: string[] };
export type KnowledgeAccess = { disabled: boolean; modelId?: string | null; connectionIds: string[] | null };

export function runKnowledgeScope(scope?: AnalysisScope, connectionId?: string | null, tableConnections: string[] = []): KnowledgeScope {
    const selected = scope?.connectionMode === 'auto' ? tableConnections : (scope?.connectionIds ?? (connectionId ? [connectionId] : []));
    return {
        knowledgeMode: scope?.knowledgeMode ?? (scope?.knowledgeModelId ? 'manual' : 'auto'),
        knowledgeModelId: scope?.knowledgeModelId,
        connectionIds: selected.length ? selected : undefined,
    };
}

export function actorConnectionIds(metadata?: Record<string, unknown> | null): string[] | null {
    const ids = metadata?.allowedConnectionIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
}

export function resolveKnowledgeAccess(scope: KnowledgeScope, authorized: string[] | null): KnowledgeAccess {
    const selected = scope.knowledgeMode === 'manual' ? undefined : scope.connectionIds;
    return {
        disabled: scope.knowledgeMode === 'none' || (scope.knowledgeMode === 'manual' && !scope.knowledgeModelId),
        modelId: scope.knowledgeMode === 'manual' ? scope.knowledgeModelId : null,
        connectionIds: selected ? selected.filter(id => !authorized || authorized.includes(id)) : authorized,
    };
}

export function allowsKnowledge(access: KnowledgeAccess, modelId: string, connections: string[]) {
    const allowed = access.connectionIds;
    return !access.disabled && (!access.modelId || access.modelId === modelId) && (!allowed || connections.some(id => allowed.includes(id)));
}
