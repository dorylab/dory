import 'server-only';

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateText } from '@/lib/ai/gateway';
import { isAiQuotaExceededError } from '@/lib/ai/usage-quota';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { cleanJson } from '@/lib/ai/core/clean-json';
export { isMissingAiEnvError } from '@/lib/ai/errors';

export async function runLLMJson<T extends z.ZodTypeAny>(args: {
    prompt: string;
    schema: T;
    temperature?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
    model?: string | null;
    context?: {
        organizationId?: string | null;
        userId?: string | null;
        req?: NextRequest | null;
        feature?: string;
    };
}) {
    const { prompt, schema, temperature = 0, maxOutputTokens, maxRetries = 1, model: requestedModel, context } = args;

    let lastErr: unknown = null;

    for (let i = 0; i <= maxRetries; i++) {
        try {
            const {
                model,
                preset,
                modelName: providerModelName,
                providerKey,
                gateway,
            } = await resolveAiLanguageModel({
                role: 'action',
                organizationId: context?.organizationId ?? null,
                requestedModel,
                req: context?.req,
            });
            const system = compileSystemPrompt(preset.system);
            const { text } = await generateText({
                model,
                system,
                prompt,
                temperature: temperature ?? preset.temperature,
                maxOutputTokens: maxOutputTokens ?? preset.maxOutputTokens,
                context: {
                    organizationId: context?.organizationId ?? null,
                    userId: context?.userId ?? null,
                    feature: context?.feature ?? 'copilot_action',
                    model: providerModelName,
                    provider: providerKey ?? undefined,
                    gateway: gateway ?? undefined,
                },
            });

            const parsed = schema.parse(parseJsonFromModelText(text));
            return parsed as z.infer<T>;
        } catch (e) {
            if (isAiQuotaExceededError(e)) {
                throw e;
            }
            lastErr = e;
        }
    }

    throw lastErr;
}

export function parseJsonFromModelText(text: string): unknown {
    const candidates = [extractFirstJsonValue(text), cleanJson(text), text.trim()].filter((candidate): candidate is string => !!candidate?.trim());
    let lastError: unknown = null;

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
}

function extractFirstJsonValue(text: string) {
    const source = stripJsonFence(text.trim());
    const start = findJsonStart(source);
    if (start < 0) return source;

    const opener = source[start];
    const closer = opener === '{' ? '}' : ']';
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let index = start; index < source.length; index += 1) {
        const char = source[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === '{' || char === '[') {
            stack.push(char === '{' ? '}' : ']');
            continue;
        }

        if (char === '}' || char === ']') {
            const expected = stack.pop();
            if (char !== expected) {
                break;
            }

            if (stack.length === 0) {
                return source.slice(start, index + 1).trim();
            }
        }
    }

    const end = source.lastIndexOf(closer);
    return end > start ? source.slice(start, end + 1).trim() : source.slice(start).trim();
}

function stripJsonFence(text: string) {
    return text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function findJsonStart(text: string) {
    const objectStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    if (objectStart < 0) return arrayStart;
    if (arrayStart < 0) return objectStart;
    return Math.min(objectStart, arrayStart);
}
