import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';

export function parseActionJsonInput(raw: string, source = 'action input') {
    if (!raw.trim()) return {};

    try {
        return JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON in ${source}: ${message}`);
    }
}

async function readStream(stream: Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString('utf8');
}

export async function readActionInput(options: { json?: string; input?: string }, stdin: NodeJS.ReadStream = process.stdin) {
    if (options.json !== undefined && options.input !== undefined) {
        throw new Error('Use only one of --json or --input.');
    }

    if (options.json !== undefined) {
        return parseActionJsonInput(options.json, '--json');
    }

    if (options.input !== undefined) {
        return parseActionJsonInput(await readFile(options.input, 'utf8'), options.input);
    }

    if (!stdin.isTTY) {
        return parseActionJsonInput(await readStream(stdin), 'stdin');
    }

    return {};
}
