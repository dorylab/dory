import 'server-only';

import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4GenerateResult, LanguageModelV4StreamPart, LanguageModelV4StreamResult } from '@ai-sdk/provider';
import type { ModelRole } from '@/lib/ai/model/types';

type DoryCloudProxyLanguageModelOptions = {
    baseUrl: string;
    headers?: HeadersInit;
    model?: string | null;
    role?: ModelRole;
};

function headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

function withoutAbortSignal(options: LanguageModelV4CallOptions): Omit<LanguageModelV4CallOptions, 'abortSignal'> {
    const { abortSignal: _abortSignal, ...rest } = options;
    return rest;
}

function parseSseJsonStream<T>(stream: ReadableStream<Uint8Array>): ReadableStream<T> {
    const decoder = new TextDecoder();
    let buffer = '';

    return stream.pipeThrough(
        new TransformStream<Uint8Array, T>({
            transform(chunk, controller) {
                buffer += decoder.decode(chunk, { stream: true });

                while (true) {
                    const index = buffer.indexOf('\n\n');
                    if (index === -1) break;

                    const event = buffer.slice(0, index);
                    buffer = buffer.slice(index + 2);

                    for (const line of event.split('\n')) {
                        if (!line.startsWith('data:')) continue;
                        const data = line.slice(5).trim();
                        if (!data || data === '[DONE]') continue;
                        controller.enqueue(JSON.parse(data) as T);
                    }
                }
            },
            flush(controller) {
                buffer += decoder.decode();
                const dataLines = buffer
                    .split('\n')
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).trim())
                    .filter(data => data && data !== '[DONE]');

                for (const data of dataLines) {
                    controller.enqueue(JSON.parse(data) as T);
                }
            },
        }),
    );
}

async function assertOk(response: Response) {
    if (response.ok) return;

    const text = await response.text().catch(() => '');
    throw new Error(text || `Cloud model request failed with ${response.status}`);
}

export function createDoryCloudProxyLanguageModel(options: DoryCloudProxyLanguageModelOptions): LanguageModelV4 {
    const streamUrl = new URL('/api/ai/model/stream', options.baseUrl).toString();
    const generateUrl = new URL('/api/ai/model/generate', options.baseUrl).toString();

    async function post(path: string, callOptions: LanguageModelV4CallOptions, signal?: AbortSignal) {
        const headers = new Headers(options.headers);
        headers.set('content-type', 'application/json');

        return fetch(path, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: options.model ?? null,
                role: options.role ?? null,
                callOptions: withoutAbortSignal(callOptions),
            }),
            signal,
        });
    }

    return {
        specificationVersion: 'v4',
        provider: 'dory-cloud',
        modelId: options.model ?? 'cloud-chat',
        supportedUrls: {},
        async doGenerate(callOptions): Promise<LanguageModelV4GenerateResult> {
            const response = await post(generateUrl, callOptions, callOptions.abortSignal);
            await assertOk(response);
            return (await response.json()) as LanguageModelV4GenerateResult;
        },
        async doStream(callOptions): Promise<LanguageModelV4StreamResult> {
            const response = await post(streamUrl, callOptions, callOptions.abortSignal);
            await assertOk(response);

            return {
                stream: response.body ? parseSseJsonStream<LanguageModelV4StreamPart>(response.body) : new ReadableStream(),
                response: {
                    headers: headersToObject(response.headers),
                },
            };
        },
    };
}
