import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { analyse } from 'chardet';
import iconv from 'iconv-lite';

import type { CsvDetectionResult, CsvEncoding, CsvParsingOptions } from './types';

const SUPPORTED_ENCODINGS: CsvEncoding[] = ['utf8', 'utf16le', 'utf16be', 'gb18030', 'big5', 'shift_jis', 'windows1252'];
const DELIMITERS = [',', '\t', ';', '|'] as const;

export async function detectCsv(filePath: string): Promise<CsvDetectionResult> {
    const sample = await readSample(filePath, 256 * 1024);
    const bom = detectBom(sample);
    const matches = analyse(sample);
    const best = matches[0];
    const ascii = isAscii(sample);
    const encoding = bom ?? (ascii ? 'utf8' : normalizeEncoding(best?.name)) ?? 'utf8';
    const confidence = bom || ascii ? 100 : (best?.confidence ?? 0);
    const decoded = iconv.decode(sample, iconvEncoding(encoding));
    const delimiter = detectDelimiter(decoded);
    const rows = parseRecords(decoded, delimiter, 8);

    return {
        options: {
            delimiter,
            hasHeader: detectHeader(rows),
            encoding,
            quoteChar: '"',
        },
        confidence,
        requiresEncodingSelection: !bom && !ascii && (!normalizeEncoding(best?.name) || confidence < 45),
        supportedEncodings: SUPPORTED_ENCODINGS,
    };
}

export async function transcodeCsvToUtf8(sourcePath: string, destinationPath: string, encoding: CsvEncoding): Promise<string> {
    if (encoding === 'utf8') return sourcePath;
    await pipeline(createReadStream(sourcePath), iconv.decodeStream(iconvEncoding(encoding)), iconv.encodeStream('utf8'), createWriteStream(destinationPath, { mode: 0o600 }));
    return destinationPath;
}

function iconvEncoding(encoding: CsvEncoding): string {
    return {
        utf8: 'utf8',
        utf16le: 'utf16-le',
        utf16be: 'utf16-be',
        gb18030: 'gb18030',
        big5: 'big5',
        shift_jis: 'shift_jis',
        windows1252: 'windows-1252',
    }[encoding];
}

function normalizeEncoding(value?: string): CsvEncoding | null {
    const normalized = value?.toLowerCase().replace(/[_-]/g, '');
    if (!normalized || normalized === 'ascii') return 'utf8';
    if (normalized === 'utf8') return 'utf8';
    if (normalized === 'utf16le') return 'utf16le';
    if (normalized === 'utf16be') return 'utf16be';
    if (normalized === 'gb18030') return 'gb18030';
    if (normalized === 'big5') return 'big5';
    if (normalized === 'shiftjis') return 'shift_jis';
    if (normalized === 'windows1252' || normalized === 'iso88591') return 'windows1252';
    return null;
}

function detectBom(buffer: Buffer): CsvEncoding | null {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 'utf8';
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf16le';
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf16be';
    return null;
}

function isAscii(buffer: Buffer): boolean {
    return buffer.every(byte => byte < 0x80);
}

function detectDelimiter(text: string): CsvParsingOptions['delimiter'] {
    let best: CsvParsingOptions['delimiter'] = ',';
    let bestScore = -1;
    for (const delimiter of DELIMITERS) {
        const rows = parseRecords(text, delimiter, 12).filter(row => row.length > 1);
        if (rows.length === 0) continue;
        const counts = rows.map(row => row.length);
        const modeCount = Math.max(...counts.map(count => counts.filter(candidate => candidate === count).length));
        const score = modeCount * 100 + Math.max(...counts);
        if (score > bestScore) {
            best = delimiter;
            bestScore = score;
        }
    }
    return best;
}

function detectHeader(rows: string[][]): boolean {
    if (rows.length < 2) return true;
    const first = rows[0];
    const rest = rows.slice(1);
    const unique = new Set(first.map(value => value.trim().toLocaleLowerCase())).size === first.length;
    const nonEmpty = first.every(value => value.trim().length > 0);
    const headerLike = first.filter(value => /^[\p{L}_][\p{L}\p{N}_ .-]*$/u.test(value.trim())).length;
    const firstTypes = first.map(valueKind);
    const differing = firstTypes.filter((kind, index) => rest.some(row => valueKind(row[index] ?? '') !== kind)).length;
    const identifierRow = first.every(value => /^[\p{L}_][\p{L}\p{N}_ .-]*$/u.test(value.trim()));
    return nonEmpty && unique && headerLike >= Math.ceil(first.length / 2) && (differing >= Math.ceil(first.length / 3) || identifierRow);
}

function valueKind(value: string) {
    const trimmed = value.trim();
    if (/^[+-]?\d+$/.test(trimmed)) return 'integer';
    if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return 'float';
    if (/^(?:true|false)$/i.test(trimmed)) return 'boolean';
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return 'date';
    return 'string';
}

function parseRecords(text: string, delimiter: string, limit: number): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length && rows.length < limit; index += 1) {
        const char = text[index];
        if (char === '"') {
            if (quoted && text[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (char === delimiter && !quoted) {
            row.push(value);
            value = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && text[index + 1] === '\n') index += 1;
            row.push(value);
            rows.push(row);
            row = [];
            value = '';
        } else {
            value += char;
        }
    }
    if (rows.length < limit && (value || row.length)) {
        row.push(value);
        rows.push(row);
    }
    return rows;
}

async function readSample(filePath: string, byteLength: number): Promise<Buffer> {
    const handle = await open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(byteLength);
        const { bytesRead } = await handle.read(buffer, 0, byteLength, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}
