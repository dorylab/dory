import {
    generateText as sdkGenerateText,
    streamText as sdkStreamText,
    type ModelMessage,
    type ToolSet,
    type LanguageModelUsage,
    type SystemModelMessage,
} from 'ai';
import { runAiWithCache as runAiWithCacheBase, type RunAiWithCacheOptions, type RunAiWithCacheResult } from './runtime/runAiWithCache';

type AiUsageStatus = 'ok' | 'error' | 'aborted';

export type AiDebugInput = {
    system?: string | SystemModelMessage | Array<SystemModelMessage> | null;
    prompt?: string | null;
    messages?: ModelMessage[] | null;
};

export type AiDebugInfo = {
    requestId: string;
    feature?: string;
    model?: string;
    promptVersion?: number;
    algoVersion?: number;
    usage?: LanguageModelUsage;
    latencyMs?: number;
    input?: AiDebugInput;
    fromCache?: boolean;
};

export type AiGatewayContext = {
    organizationId?: string | null;
    userId?: string | null;
    feature?: string;
    model?: string;
    promptVersion?: number;
    algoVersion?: number;
    requestId?: string;
    connectionId?: string | null;
    gateway?: string | null;
    provider?: string | null;
    traceId?: string | null;
    spanId?: string | null;
    costMicros?: number | null;
};

export type RedactionOptions = {
    maxStringLength?: number;
    maxArrayLength?: number;
    maxDepth?: number;
    protectedKeys?: string[];
};

export type AiDebugOptions = {
    enabled?: boolean;
    redaction?: RedactionOptions;
    onDebug?: (info: AiDebugInfo) => void;
};

export type AiMeteringOptions = {
    enabled?: boolean;
    onWrite?: (record: AiUsageRecord) => Promise<void> | void;
    onTrace?: (record: AiTraceRecord) => Promise<void> | void;
};

export type AiUsageRecord = {
    requestId: string;
    organizationId?: string | null;
    userId?: string | null;
    feature?: string;
    model?: string;
    promptVersion?: number;
    algoVersion?: number;
    usage?: LanguageModelUsage;
    latencyMs?: number;
    fromCache?: boolean;
    status?: AiUsageStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    gateway?: string | null;
    provider?: string | null;
    costMicros?: number | null;
    traceId?: string | null;
    spanId?: string | null;
    usageJson?: Record<string, unknown> | null;
};

export type AiTraceRecord = {
    requestId: string;
    organizationId?: string | null;
    userId?: string | null;
    feature?: string;
    model?: string;
    inputText?: string | null;
    outputText?: string | null;
    inputJson?: Record<string, unknown> | null;
    outputJson?: Record<string, unknown> | null;
    redacted?: boolean;
};

type GenerateTextOptions = Parameters<typeof sdkGenerateText>[0] & {
    context?: AiGatewayContext;
    debug?: AiDebugOptions;
    meter?: AiMeteringOptions;
};

type StreamTextOptions<TOOLS extends ToolSet> = Parameters<typeof sdkStreamText<TOOLS>>[0] & {
    context?: AiGatewayContext;
    debug?: AiDebugOptions;
    meter?: AiMeteringOptions;
};

type UsageLike = Pick<
    LanguageModelUsage,
    | 'inputTokens'
    | 'outputTokens'
    | 'reasoningTokens'
    | 'cachedInputTokens'
    | 'totalTokens'
>;

const DEFAULT_PROTECTED_KEYS = [
    'password',
    'passwd',
    'secret',
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'api_key',
    'apikey',
    'authorization',
    'cookie',
    'private_key',
    'ssh',
    'signature',
    'session',
];

const DEFAULT_MAX_STRING_LENGTH = 2000;
const DEFAULT_MAX_ARRAY_LENGTH = 50;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_ERROR_MESSAGE_LENGTH = 600;
const DEFAULT_TRACE_TEXT_LENGTH = 12000;

function createRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return (crypto as { randomUUID: () => string }).randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateString(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...(truncated)`;
}

function sanitizeForDebug(
    value: unknown,
    options: Required<RedactionOptions>,
    depth = 0,
    seen = new WeakSet<object>(),
): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
        return truncateString(value, options.maxStringLength);
    }
    if (typeof value !== 'object') return value;

    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);

    if (depth >= options.maxDepth) return '[truncated]';

    if (Array.isArray(value)) {
        const sliced = value.slice(0, options.maxArrayLength);
        return sliced.map(entry => sanitizeForDebug(entry, options, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (options.protectedKeys.some(protectedKey => lowerKey.includes(protectedKey))) {
            result[key] = '[redacted]';
            continue;
        }
        result[key] = sanitizeForDebug(entry, options, depth + 1, seen);
    }
    return result;
}

function buildDebugInput(
    input: AiDebugInput,
    options?: RedactionOptions,
): AiDebugInput {
    const redaction: Required<RedactionOptions> = {
        maxStringLength: options?.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
        maxArrayLength: options?.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH,
        maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
        protectedKeys: [
            ...DEFAULT_PROTECTED_KEYS,
            ...(options?.protectedKeys ?? []),
        ],
    };

    return {
        system: input.system
            ? (sanitizeForDebug(input.system, redaction) as AiDebugInput['system'])
            : input.system ?? null,
        prompt: input.prompt
            ? (sanitizeForDebug(input.prompt, redaction) as string)
            : input.prompt ?? null,
        messages: input.messages
            ? (sanitizeForDebug(input.messages, redaction) as ModelMessage[])
            : input.messages ?? null,
    };
}

async function writeAiUsage(
    record: AiUsageRecord,
    meter?: AiMeteringOptions,
    trace?: AiTraceRecord,
): Promise<void> {
    if (meter?.enabled === false) return;
    if (meter?.onWrite) {
        await meter.onWrite(record);
    } else {
        await writeAiUsageToDatabase(record);
    }

    if (trace) {
        if (meter?.onTrace) {
            await meter.onTrace(trace);
        } else {
            await writeAiTraceToDatabase(trace);
        }
    }

    if (typeof process !== 'undefined' && process.env.AI_USAGE_LOG === '1') {
        console.info('[ai][usage]', JSON.stringify(record));
    }
}

function extractUsageFields(usage?: LanguageModelUsage) {
    return {
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        reasoningTokens: usage?.reasoningTokens ?? null,
        cachedInputTokens: usage?.cachedInputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
    };
}

function addTokenCounts(a: number | undefined, b: number | undefined): number | undefined {
    return a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
}

function addUsage(current: UsageLike, next: UsageLike): UsageLike {
    return {
        inputTokens: addTokenCounts(current.inputTokens, next.inputTokens),
        outputTokens: addTokenCounts(current.outputTokens, next.outputTokens),
        reasoningTokens: addTokenCounts(current.reasoningTokens, next.reasoningTokens),
        cachedInputTokens: addTokenCounts(current.cachedInputTokens, next.cachedInputTokens),
        totalTokens: addTokenCounts(current.totalTokens, next.totalTokens),
    };
}

function sumUsage(usages: Array<LanguageModelUsage | undefined>): LanguageModelUsage | undefined {
    let acc: UsageLike | undefined;
    for (const usage of usages) {
        if (!usage) continue;
        acc = acc ? addUsage(acc, usage) : {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningTokens: usage.reasoningTokens,
            cachedInputTokens: usage.cachedInputTokens,
            totalTokens: usage.totalTokens,
        };
    }

    if (!acc) return undefined;
    return {
        ...acc,
        inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: acc.cachedInputTokens,
            cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: acc.reasoningTokens,
        },
    };
}

function inferGateway(context?: AiGatewayContext): string | null {
    if (context?.gateway) return context.gateway;
    if (typeof process === 'undefined') return null;
    const envBaseUrl = (process.env.DORY_AI_URL ?? '').trim().toLowerCase();
    if (!envBaseUrl) return null;
    if (envBaseUrl.includes('gateway.ai.cloudflare.com')) return 'cloudflare';
    return 'direct';
}

function inferProvider(context?: AiGatewayContext): string | null {
    if (context?.provider) return context.provider;
    if (typeof process === 'undefined') return null;
    const provider = (process.env.DORY_AI_PROVIDER ?? '').trim().toLowerCase();
    return provider || null;
}

function toUsageJson(usage?: LanguageModelUsage): Record<string, unknown> | null {
    if (!usage) return null;
    return {
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        reasoningTokens: usage.reasoningTokens ?? usage.outputTokenDetails?.reasoningTokens ?? null,
        cachedInputTokens: usage.cachedInputTokens ?? usage.inputTokenDetails?.cacheReadTokens ?? null,
        inputTokenDetails: {
            noCacheTokens: usage.inputTokenDetails?.noCacheTokens ?? null,
            cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? null,
            cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? null,
        },
        outputTokenDetails: {
            textTokens: usage.outputTokenDetails?.textTokens ?? null,
            reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? null,
        },
        raw: usage.raw ?? null,
    };
}

function toErrorParts(error: unknown): { code: string | null; message: string | null } {
    if (!error) return { code: null, message: null };

    if (typeof error === 'string') {
        return {
            code: null,
            message: truncateString(error, DEFAULT_ERROR_MESSAGE_LENGTH),
        };
    }

    if (typeof error === 'object') {
        const errObj = error as {
            code?: string | number;
            message?: string;
            error?: { code?: string | number; message?: string };
        };
        const code = errObj.code ?? errObj.error?.code;
        const message = errObj.message ?? errObj.error?.message;
        return {
            code: code !== undefined && code !== null ? String(code) : null,
            message: message ? truncateString(message, DEFAULT_ERROR_MESSAGE_LENGTH) : null,
        };
    }

    return { code: null, message: null };
}

function buildTraceRecord(args: {
    requestId: string;
    context?: AiGatewayContext;
    debugInput: AiDebugInput;
    outputText?: string | null;
    outputJson?: Record<string, unknown> | null;
}): AiTraceRecord {
    const { requestId, context, debugInput, outputText, outputJson } = args;
    const prompt = typeof debugInput.prompt === 'string' ? debugInput.prompt : null;
    const messagesText = debugInput.messages ? JSON.stringify(debugInput.messages) : null;
    const systemText = debugInput.system ? JSON.stringify(debugInput.system) : null;
    const mergedInputText = [prompt, systemText, messagesText]
        .filter((part): part is string => !!part && part.length > 0)
        .join('\n\n');

    return {
        requestId,
        organizationId: context?.organizationId ?? null,
        userId: context?.userId ?? null,
        feature: context?.feature,
        model: context?.model,
        inputText: mergedInputText ? truncateString(mergedInputText, DEFAULT_TRACE_TEXT_LENGTH) : null,
        outputText: outputText ? truncateString(outputText, DEFAULT_TRACE_TEXT_LENGTH) : null,
        inputJson: sanitizeForDebug(
            debugInput,
            {
                maxStringLength: DEFAULT_TRACE_TEXT_LENGTH,
                maxArrayLength: DEFAULT_MAX_ARRAY_LENGTH,
                maxDepth: DEFAULT_MAX_DEPTH,
                protectedKeys: DEFAULT_PROTECTED_KEYS,
            },
        ) as Record<string, unknown>,
        outputJson: outputJson ?? null,
        redacted: true,
    };
}

let aiUsageDepsPromise: Promise<{
    getClient: () => Promise<unknown>;
    aiUsageEvents: unknown;
    aiUsageTraces: unknown;
}> | null = null;

async function getAiUsageDeps() {
    if (!aiUsageDepsPromise) {
        aiUsageDepsPromise = Promise.all([
            import('@/lib/database/postgres/client'),
            import('@/lib/database/postgres/schemas'),
        ]).then(([clientModule, schemaModule]) => ({
            getClient: clientModule.getClient,
            aiUsageEvents: schemaModule.aiUsageEvents,
            aiUsageTraces: schemaModule.aiUsageTraces,
        }));
    }
    return aiUsageDepsPromise;
}

async function writeAiUsageToDatabase(record: AiUsageRecord): Promise<void> {
    try {
        const { getClient, aiUsageEvents } = await getAiUsageDeps();
        const db = (await getClient()) as {
            insert: (table: unknown) => {
                values: (value: Record<string, unknown>) => {
                    onConflictDoUpdate: (args: { target: unknown; set: Record<string, unknown> }) => Promise<void>;
                };
            };
        };
        const usage = extractUsageFields(record.usage);
        const setValues = {
            organizationId: record.organizationId ?? null,
            userId: record.userId ?? null,
            feature: record.feature ?? null,
            model: record.model ?? null,
            promptVersion: record.promptVersion ?? null,
            algoVersion: record.algoVersion ?? null,
            status: record.status ?? 'ok',
            errorCode: record.errorCode ?? null,
            errorMessage: record.errorMessage ? truncateString(record.errorMessage, DEFAULT_ERROR_MESSAGE_LENGTH) : null,
            gateway: record.gateway ?? null,
            provider: record.provider ?? null,
            costMicros: record.costMicros ?? null,
            traceId: record.traceId ?? null,
            spanId: record.spanId ?? null,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningTokens: usage.reasoningTokens,
            cachedInputTokens: usage.cachedInputTokens,
            totalTokens: usage.totalTokens,
            usageJson: record.usageJson ?? toUsageJson(record.usage),
            latencyMs: record.latencyMs ?? null,
            fromCache: record.fromCache ?? false,
        };

        await db.insert(aiUsageEvents).values({
            requestId: record.requestId,
            ...setValues,
        }).onConflictDoUpdate({
            target: (aiUsageEvents as { requestId: unknown }).requestId,
            set: setValues,
        });
    } catch (error) {
        console.error('[ai][usage] failed to write ai_usage_events', error);
    }
}

async function writeAiTraceToDatabase(record: AiTraceRecord): Promise<void> {
    try {
        const { getClient, aiUsageTraces } = await getAiUsageDeps();
        const db = (await getClient()) as {
            insert: (table: unknown) => {
                values: (value: Record<string, unknown>) => {
                    onConflictDoUpdate: (args: { target: unknown; set: Record<string, unknown> }) => Promise<void>;
                };
            };
        };
        const setValues = {
            organizationId: record.organizationId ?? null,
            userId: record.userId ?? null,
            feature: record.feature ?? null,
            model: record.model ?? null,
            inputText: record.inputText ?? null,
            outputText: record.outputText ?? null,
            inputJson: record.inputJson ?? null,
            outputJson: record.outputJson ?? null,
            redacted: record.redacted ?? true,
        };
        await db.insert(aiUsageTraces).values({
            requestId: record.requestId,
            ...setValues,
        }).onConflictDoUpdate({
            target: (aiUsageTraces as { requestId: unknown }).requestId,
            set: setValues,
        });
    } catch (error) {
        console.error('[ai][usage] failed to write ai_usage_traces', error);
    }
}

function emitDebug(debug: AiDebugInfo, options?: AiDebugOptions) {
    if (options?.enabled === false) return;
    if (options?.onDebug) {
        options.onDebug(debug);
        return;
    }
    if (typeof process !== 'undefined' && process.env.AI_DEBUG === '1') {
        console.debug('[ai][debug]', JSON.stringify(debug));
    }
}

export async function generateText(
    options: GenerateTextOptions,
): Promise<Awaited<ReturnType<typeof sdkGenerateText>> & { debug: AiDebugInfo }> {
    const { context, debug: debugOptions, meter, ...callOptions } = options;
    const startedAt = Date.now();
    const requestId = context?.requestId ?? createRequestId();
    const promptVersion = context?.promptVersion ?? 1;
    const algoVersion = context?.algoVersion;

    const promptValue = typeof callOptions.prompt === 'string' ? callOptions.prompt : null;
    const messagesValue = (callOptions as { messages?: ModelMessage[] }).messages ?? null;
    const systemValue = callOptions.system ?? null;

    const debugInput = buildDebugInput(
        {
            system: systemValue,
            prompt: promptValue,
            messages: messagesValue,
        },
        debugOptions?.redaction,
    );

    try {
        const result = await sdkGenerateText(callOptions);
        const usage = result.usage;
        const debug: AiDebugInfo = {
            requestId,
            feature: context?.feature,
            model: context?.model,
            promptVersion,
            algoVersion,
            usage,
            latencyMs: Date.now() - startedAt,
            input: debugInput,
        };

        emitDebug(debug, debugOptions);
        await writeAiUsage(
            {
                requestId,
                organizationId: context?.organizationId ?? null,
                userId: context?.userId ?? null,
                feature: context?.feature,
                model: context?.model,
                promptVersion,
                algoVersion,
                usage,
                usageJson: toUsageJson(usage),
                latencyMs: debug.latencyMs,
                fromCache: false,
                status: 'ok',
                gateway: inferGateway(context),
                provider: inferProvider(context),
                costMicros: context?.costMicros ?? null,
                traceId: context?.traceId ?? null,
                spanId: context?.spanId ?? null,
            },
            meter,
            buildTraceRecord({
                requestId,
                context,
                debugInput,
                outputText: typeof result.text === 'string' ? result.text : null,
                outputJson: { text: typeof result.text === 'string' ? result.text : null },
            }),
        );

        return Object.assign(result, { debug });
    } catch (error) {
        const err = toErrorParts(error);
        await writeAiUsage(
            {
                requestId,
                organizationId: context?.organizationId ?? null,
                userId: context?.userId ?? null,
                feature: context?.feature,
                model: context?.model,
                promptVersion,
                algoVersion,
                latencyMs: Date.now() - startedAt,
                fromCache: false,
                status: 'error',
                errorCode: err.code,
                errorMessage: err.message,
                gateway: inferGateway(context),
                provider: inferProvider(context),
                costMicros: context?.costMicros ?? null,
                traceId: context?.traceId ?? null,
                spanId: context?.spanId ?? null,
            },
            meter,
            buildTraceRecord({
                requestId,
                context,
                debugInput,
                outputText: null,
                outputJson: err.message ? { error: err.message, code: err.code } : null,
            }),
        );
        throw error;
    }
}

export function streamText<TOOLS extends ToolSet>(
    options: StreamTextOptions<TOOLS>,
): ReturnType<typeof sdkStreamText<TOOLS>> & { debug: AiDebugInfo; debugReady: Promise<AiDebugInfo> } {
    const { context, debug: debugOptions, meter, ...callOptions } = options;
    const startedAt = Date.now();
    const requestId = context?.requestId ?? createRequestId();
    const promptVersion = context?.promptVersion ?? 1;
    const algoVersion = context?.algoVersion;

    const debugInput = buildDebugInput(
        {
            system: callOptions.system ?? null,
            prompt: callOptions.prompt as string,
            messages: (callOptions as { messages?: ModelMessage[] }).messages ?? null,
        },
        debugOptions?.redaction,
    );

    let resolveDebugReady: (debug: AiDebugInfo) => void;
    const debugReady = new Promise<AiDebugInfo>(resolve => {
        resolveDebugReady = resolve;
    });

    const debug: AiDebugInfo = {
        requestId,
        feature: context?.feature,
        model: context?.model,
        promptVersion,
        algoVersion,
        input: debugInput,
    };
    const gateway = inferGateway(context);
    const provider = inferProvider(context);
    const shouldLogCloudflareStreamUsage =
        context?.feature === 'chat_stream' &&
        gateway === 'cloudflare' &&
        typeof process !== 'undefined' &&
        process.env.AI_USAGE_LOG === '1';

    let finalized = false;
    const finalize = async (args: {
        status: AiUsageStatus;
        usage?: LanguageModelUsage;
        outputText?: string | null;
        outputJson?: Record<string, unknown> | null;
        error?: unknown;
    }) => {
        if (finalized) return;
        finalized = true;

        const err = args.error ? toErrorParts(args.error) : { code: null, message: null };
        const latencyMs = Date.now() - startedAt;
        debug.usage = args.usage ?? debug.usage;
        debug.latencyMs = latencyMs;
        emitDebug(debug, debugOptions);

        await writeAiUsage(
            {
                requestId,
                organizationId: context?.organizationId ?? null,
                userId: context?.userId ?? null,
                feature: context?.feature,
                model: context?.model,
                promptVersion,
                algoVersion,
                usage: args.usage ?? debug.usage,
                usageJson: toUsageJson(args.usage ?? debug.usage),
                latencyMs,
                fromCache: false,
                status: args.status,
                errorCode: err.code,
                errorMessage: err.message,
                gateway,
                provider,
                costMicros: context?.costMicros ?? null,
                traceId: context?.traceId ?? null,
                spanId: context?.spanId ?? null,
            },
            meter,
            buildTraceRecord({
                requestId,
                context,
                debugInput,
                outputText: args.outputText ?? null,
                outputJson: args.outputJson ?? null,
            }),
        );

        resolveDebugReady(debug);
    };

    const wrappedOnFinish = async (event: Parameters<NonNullable<typeof callOptions.onFinish>>[0]) => {
        const finishReason = (event as { finishReason?: string }).finishReason ?? null;
        const isAborted = (event as { isAborted?: boolean }).isAborted === true || finishReason === 'abort';
        const text = (event as { text?: string }).text ?? null;
        const fallbackStepUsage = sumUsage(event.steps.map(step => step.usage));
        const usage = event.totalUsage ?? event.usage ?? fallbackStepUsage;
        if (shouldLogCloudflareStreamUsage) {
            console.info('[ai][stream-usage][cloudflare][finish]', {
                requestId,
                feature: context?.feature ?? null,
                provider: provider ?? null,
                gateway,
                finishReason,
                isAborted,
                hasTotalUsage: !!event.totalUsage,
                hasUsage: !!event.usage,
                hasFallbackStepUsage: !!fallbackStepUsage,
                steps: event.steps.length,
                stepsWithUsage: event.steps.filter(step => !!step.usage).length,
                resolvedUsage: extractUsageFields(usage),
            });
        }
        await finalize({
            status: isAborted ? 'aborted' : 'ok',
            usage,
            outputText: text,
            outputJson: {
                finishReason,
                text,
            },
        });
        if (callOptions.onFinish) {
            await callOptions.onFinish(event);
        }
    };

    const wrappedOnError = async (event: Parameters<NonNullable<typeof callOptions.onError>>[0]) => {
        await finalize({
            status: 'error',
            error: event,
            outputJson: {
                error: toErrorParts(event).message,
                code: toErrorParts(event).code,
            },
        });
        if (callOptions.onError) {
            await callOptions.onError(event);
        }
    };

    const wrappedOnAbort = async (event: Parameters<NonNullable<typeof callOptions.onAbort>>[0]) => {
        const usage = sumUsage(event.steps.map(step => step.usage));
        if (shouldLogCloudflareStreamUsage) {
            console.info('[ai][stream-usage][cloudflare][abort]', {
                requestId,
                feature: context?.feature ?? null,
                provider: provider ?? null,
                gateway,
                steps: event.steps.length,
                stepsWithUsage: event.steps.filter(step => !!step.usage).length,
                resolvedUsage: extractUsageFields(usage),
            });
        }
        await finalize({
            status: 'aborted',
            usage,
            outputJson: {
                finishReason: 'abort',
                steps: event.steps.length,
            },
        });
        if (callOptions.onAbort) {
            await callOptions.onAbort(event);
        }
    };

    const result = sdkStreamText({
        ...callOptions,
        onFinish: wrappedOnFinish,
        onError: wrappedOnError,
        onAbort: wrappedOnAbort,
    });

    return Object.assign(result, { debug, debugReady });
}

export async function runAiWithCache<TNormalized, TPayload>(
    options: RunAiWithCacheOptions<TNormalized, TPayload> & {
        context?: AiGatewayContext;
    },
): Promise<RunAiWithCacheResult<TNormalized, TPayload>> {
    const { context, ...cacheOptions } = options;
    const requestId = context?.requestId ?? createRequestId();
    const promptVersion = cacheOptions.promptVersion ?? context?.promptVersion ?? 1;
    const algoVersion = cacheOptions.algoVersion ?? context?.algoVersion;

    const result = await runAiWithCacheBase({
        ...cacheOptions,
        promptVersion,
        algoVersion,
    });

    if (result.fromCache) {
        await writeAiUsage({
            requestId,
            organizationId: context?.organizationId ?? cacheOptions.organizationId ?? null,
            userId: context?.userId ?? null,
            feature: context?.feature ?? cacheOptions.feature,
            model: context?.model ?? cacheOptions.model,
            promptVersion,
            algoVersion,
            fromCache: true,
            status: 'ok',
            gateway: inferGateway(context),
            provider: inferProvider(context),
            costMicros: context?.costMicros ?? null,
            traceId: context?.traceId ?? null,
            spanId: context?.spanId ?? null,
            usageJson: null,
        });
    }

    return result;
}
