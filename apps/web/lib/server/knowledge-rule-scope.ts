// Shared by Agent asset reads and prompt context. An unresolved metric scope is
// deliberately empty; null sourceConnectionId never promotes it to global scope.
export type ScopedRule = {
    id: string;
    revision: number;
    status?: string;
    applicationScope?: 'model' | 'data_source' | 'metrics';
    payload: { sourceConnectionId: string | null; applicationScope?: 'model' | 'data_source' | 'metrics'; name: string; description: string };
    metricIds?: string[];
    metrics?: Array<{ id: string; name: string; sourceConnectionId: string }>;
};
export function ruleScope(rule: ScopedRule) {
    return rule.applicationScope ?? rule.payload.applicationScope ?? (rule.payload.sourceConnectionId ? 'data_source' : 'model');
}
export function ruleAppliesToMetric(rule: ScopedRule, metric: { id: string; sourceConnectionId: string }) {
    if (rule.status === 'archived') return false;
    if (rule.payload.sourceConnectionId && rule.payload.sourceConnectionId !== metric.sourceConnectionId) return false;
    return ruleScope(rule) !== 'metrics' || Boolean(rule.metricIds?.includes(metric.id));
}
export function ruleConnectionIds(rule: ScopedRule, dataSources: Array<{ connectionId: string }>): string[] {
    if (ruleScope(rule) === 'metrics') return [...new Set(rule.metrics?.map(m => m.sourceConnectionId) ?? [])].filter(id => dataSources.some(d => d.connectionId === id));
    return rule.payload.sourceConnectionId ? [rule.payload.sourceConnectionId] : dataSources.map(d => d.connectionId);
}
