export type AiUsageStatus = 'ok' | 'error' | 'aborted';

export type AiUsageOverviewParams = {
    organizationId: string;
    from?: string | null;
    to?: string | null;
    feature?: string | null;
    userId?: string | null;
    model?: string | null;
};

export type AiUsageKpis = {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    cacheHits: number;
    errors: number;
    aborted: number;
    avgLatencyMs: number;
    totalCostMicros: number;
    cacheHitRate: number;
    errorRate: number;
};

export type AiUsageFeatureRow = {
    feature: string;
    requests: number;
    totalTokens: number;
    errors: number;
};

export type AiUsageUserRow = {
    userId: string;
    userName: string;
    requests: number;
    totalTokens: number;
    errors: number;
};

export type AiUsageTimeseriesRow = {
    ts: string;
    requests: number;
    totalTokens: number;
    errors: number;
};

export type AiUsageOverviewResponse = {
    kpis: AiUsageKpis;
    byFeature: AiUsageFeatureRow[];
    byUser: AiUsageUserRow[];
    timeseries: AiUsageTimeseriesRow[];
    quota?: AiUsageQuotaOverview;
};

export type AiUsageEventsParams = AiUsageOverviewParams & {
    status?: string | null;
    fromCache?: boolean | null;
    includeTrace?: boolean;
    cursor?: string | null;
    limit?: number;
};

export type AiUsageTracePayload = {
    inputText: string | null;
    outputText: string | null;
    inputJson: Record<string, unknown> | null;
    outputJson: Record<string, unknown> | null;
    redacted: boolean;
    expiresAt: string;
};

export type AiUsageEventItem = {
    id: string;
    requestId: string;
    createdAt: string;
    organizationId: string | null;
    userId: string | null;
    userName: string;
    feature: string | null;
    model: string | null;
    promptVersion: number | null;
    algoVersion: number | null;
    status: AiUsageStatus;
    errorCode: string | null;
    errorMessage: string | null;
    gateway: string | null;
    provider: string | null;
    costMicros: number | null;
    traceId: string | null;
    spanId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedInputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
    fromCache: boolean;
    usageJson: Record<string, unknown> | null;
    trace: AiUsageTracePayload | null;
};

export type AiUsageEventsResponse = {
    items: AiUsageEventItem[];
    nextCursor: string | null;
};

export type AiUsageQuotaOverview = {
    plan: 'hobby' | 'pro';
    usedTokens: number;
    limitTokens: number | null;
    remainingTokens: number | null;
    resetAt: string;
    enforced: boolean;
};

export type AiUsageMonthlyTokenUsageParams = {
    organizationId: string;
    from: string | Date;
    to: string | Date;
};

export type AiUsageWriteEventInput = {
    requestId: string;
    organizationId?: string | null;
    userId?: string | null;
    feature?: string | null;
    model?: string | null;
    promptVersion?: number | null;
    algoVersion?: number | null;
    status?: AiUsageStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    gateway?: string | null;
    provider?: string | null;
    costMicros?: number | null;
    traceId?: string | null;
    spanId?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    reasoningTokens?: number | null;
    cachedInputTokens?: number | null;
    totalTokens?: number | null;
    usageJson?: Record<string, unknown> | null;
    latencyMs?: number | null;
    fromCache?: boolean;
};

export type AiUsageWriteTraceInput = {
    requestId: string;
    organizationId?: string | null;
    userId?: string | null;
    feature?: string | null;
    model?: string | null;
    inputText?: string | null;
    outputText?: string | null;
    inputJson?: Record<string, unknown> | null;
    outputJson?: Record<string, unknown> | null;
    redacted?: boolean;
};

export interface AiUsageRepository {
    init(): Promise<void>;
    getOverview(params: AiUsageOverviewParams): Promise<AiUsageOverviewResponse>;
    listEvents(params: AiUsageEventsParams): Promise<AiUsageEventsResponse>;
    getMonthlyTokenUsage(params: AiUsageMonthlyTokenUsageParams): Promise<number>;
    writeEvent(input: AiUsageWriteEventInput): Promise<void>;
    writeTrace(input: AiUsageWriteTraceInput): Promise<void>;
}
