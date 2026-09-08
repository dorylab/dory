import { parseJsonEventStream, uiMessageChunkSchema, type UIMessageChunk } from 'ai';

import type { CloudToolDeclaration } from './cloud-tools';

export type CloudStreamRequest = {
    instructions?: string;
    /** @deprecated Accepted by the server during V6-to-V7 rolling upgrades. */
    system?: string;
    messages: unknown[];
    tools?: Record<string, CloudToolDeclaration> | null;
    toolChoice?: 'auto' | 'none';
    temperature?: number;
    maxSteps?: number;
    model?: string | null;
};

export type CloudStreamResponse = {
    response: Response;
    stream: ReadableStream<UIMessageChunk>;
};

type ParseResult<T> = { success: true; value: T; rawValue: unknown } | { success: false; error: unknown; rawValue: unknown };

export async function fetchCloudUiMessageStream(options: { url: string; payload: CloudStreamRequest; headers?: HeadersInit }): Promise<CloudStreamResponse> {
    const headers = new Headers(options.headers);
    if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }

    const response = await fetch(options.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(options.payload),
    });

    if (!response.body) {
        return { response, stream: new ReadableStream() };
    }

    const parsedStream = parseJsonEventStream({
        stream: response.body,
        schema: uiMessageChunkSchema,
    });

    const stream = parsedStream.pipeThrough(
        new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
            transform(result, controller) {
                if (result.success) {
                    controller.enqueue(result.value);
                }
            },
        }),
    );

    return { response, stream };
}
