import {
    generateText as sdkGenerateText,
    streamText as sdkStreamText,
    type ModelMessage,
    type ToolSet,
    type LanguageModelUsage,
    type SystemModelMessage,
} from 'ai';
import { runAiWithCache as runAiWithCacheBase, type RunAiWithCacheOptions, type RunAiWithCacheResult } from './runtime/runAiWithCache';

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
    teamId?: string | null;
    userId?: string | null;
    feature?: string;
    model?: string;
    promptVersion?: number;
    algoVersion?: number;
    requestId?: string;
    connectionId?: string | null;
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
};

export type AiUsageRecord = {
    requestId: string;
    teamId?: string | null;
    userId?: string | null;
    feature?: string;
    model?: string;
    promptVersion?: number;
    algoVersion?: number;
    usage?: LanguageModelUsage;
    latencyMs?: number;
    fromCache?: boolean;
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
): Promise<void> {
    if (meter?.enabled === false) return;
    if (meter?.onWrite) {
        await meter.onWrite(record);
        return;
    }
    if (typeof process !== 'undefined' && process.env.AI_USAGE_LOG === '1') {
        console.info('[ai][usage]', JSON.stringify(record));
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
            teamId: context?.teamId ?? null,
            userId: context?.userId ?? null,
            feature: context?.feature,
            model: context?.model,
            promptVersion,
            algoVersion,
            usage,
            latencyMs: debug.latencyMs,
            fromCache: false,
        },
        meter,
    );

    return Object.assign(result, { debug });
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

    const wrappedOnFinish = async (event: Parameters<NonNullable<typeof callOptions.onFinish>>[0]) => {
        debug.usage = event.totalUsage;
        debug.latencyMs = Date.now() - startedAt;
        emitDebug(debug, debugOptions);
        await writeAiUsage(
            {
                requestId,
                teamId: context?.teamId ?? null,
                userId: context?.userId ?? null,
                feature: context?.feature,
                model: context?.model,
                promptVersion,
                algoVersion,
                usage: debug.usage,
                latencyMs: debug.latencyMs,
                fromCache: false,
            },
            meter,
        );
        resolveDebugReady(debug);
        if (callOptions.onFinish) {
            await callOptions.onFinish(event);
        }
    };

    const result = sdkStreamText({
        ...callOptions,
        onFinish: wrappedOnFinish,
    });

    return Object.assign(result, { debug, debugReady });
}

export async function runAiWithCache<TNormalized, TPayload>(
    options: RunAiWithCacheOptions<TNormalized, TPayload> & {
        context?: AiGatewayContext;
    },
): Promise<RunAiWithCacheResult<TNormalized, TPayload>> {
    const { context, ...cacheOptions } = options;
    const promptVersion = cacheOptions.promptVersion ?? context?.promptVersion ?? 1;
    const algoVersion = cacheOptions.algoVersion ?? context?.algoVersion;


    return runAiWithCacheBase({
        ...cacheOptions,
        promptVersion,
        algoVersion,
    });
}
