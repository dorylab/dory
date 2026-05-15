import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createReadStream, type ReadStream } from 'node:fs';

import type {
    LocalFileRelationManifest,
    LocalFileRelationMode,
    LocalFileSourceBackend,
    LocalFileSourceDescriptor,
    LocalFileSourceStat,
    LocalFileSourceType,
} from '@dory/shared/types/local-files';

const SUPPORTED_EXTENSIONS: Record<string, LocalFileSourceType> = {
    '.csv': 'csv',
    '.tsv': 'csv',
    '.parquet': 'parquet',
    '.json': 'json',
    '.jsonl': 'json',
    '.ndjson': 'json',
    '.xlsx': 'excel',
    '.xlsm': 'excel',
};

export type FileBackend = {
    name: LocalFileSourceBackend;
    statSource(source: LocalFileSourceDescriptor): Promise<LocalFileSourceStat>;
    openReadable(source: LocalFileSourceDescriptor): Promise<NodeJS.ReadableStream>;
    resolveDuckdbPath(source: LocalFileSourceDescriptor): Promise<string>;
};

type ZipEntry = {
    name: string;
    compressionMethod: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
};

const backends = new Map<LocalFileSourceBackend, FileBackend>();

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function normalizeIdentifier(value: string, fallback = 'relation') {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
    const withFallback = normalized || fallback;
    return /^[a-z_]/.test(withFallback) ? withFallback : `_${withFallback}`;
}

function uniqueName(base: string, used: Set<string>) {
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
        candidate = `${base}_${suffix}`;
        suffix += 1;
    }
    used.add(candidate);
    return candidate;
}

function decodeXml(value: string) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function readUInt32(buffer: Buffer, offset: number) {
    return buffer.readUInt32LE(offset);
}

function readUInt16(buffer: Buffer, offset: number) {
    return buffer.readUInt16LE(offset);
}

function sourceBackend(source: LocalFileSourceDescriptor): LocalFileSourceBackend {
    return source.backend;
}

function unsupportedBackend(name: LocalFileSourceBackend): FileBackend {
    const fail = async () => {
        throw new Error(`Unsupported file backend: ${name}`);
    };
    return {
        name,
        statSource: fail,
        openReadable: fail,
        resolveDuckdbPath: fail,
    };
}

function parseZipEntries(buffer: Buffer): ZipEntry[] {
    let eocdOffset = -1;
    for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
        if (readUInt32(buffer, offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0) {
        throw new Error('Invalid XLSX file: missing zip directory');
    }

    const entryCount = readUInt16(buffer, eocdOffset + 10);
    let centralOffset = readUInt32(buffer, eocdOffset + 16);
    const entries: ZipEntry[] = [];

    for (let i = 0; i < entryCount; i += 1) {
        if (readUInt32(buffer, centralOffset) !== 0x02014b50) {
            throw new Error('Invalid XLSX file: malformed zip directory');
        }
        const compressionMethod = readUInt16(buffer, centralOffset + 10);
        const compressedSize = readUInt32(buffer, centralOffset + 20);
        const uncompressedSize = readUInt32(buffer, centralOffset + 24);
        const fileNameLength = readUInt16(buffer, centralOffset + 28);
        const extraLength = readUInt16(buffer, centralOffset + 30);
        const commentLength = readUInt16(buffer, centralOffset + 32);
        const localHeaderOffset = readUInt32(buffer, centralOffset + 42);
        const name = buffer.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString('utf8');

        entries.push({
            name,
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset,
        });

        centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
    const offset = entry.localHeaderOffset;
    if (readUInt32(buffer, offset) !== 0x04034b50) {
        throw new Error(`Invalid XLSX file: malformed local header for ${entry.name}`);
    }
    const fileNameLength = readUInt16(buffer, offset + 26);
    const extraLength = readUInt16(buffer, offset + 28);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
        return compressed.toString('utf8');
    }
    if (entry.compressionMethod === 8) {
        return inflateRawSync(compressed).toString('utf8');
    }

    throw new Error(`Unsupported XLSX compression method: ${entry.compressionMethod}`);
}

function extractWorkbookSheets(workbookXml: string): string[] {
    const sheets: string[] = [];
    const sheetRegex = /<(?:[A-Za-z_][\w.-]*:)?sheet\b[^>]*\bname=(["'])(.*?)\1[^>]*\/?>/g;
    for (const match of workbookXml.matchAll(sheetRegex)) {
        if (match[2]) {
            sheets.push(decodeXml(match[2]));
        }
    }
    return sheets;
}

async function inspectExcelSheets(filePath: string): Promise<string[]> {
    const buffer = await fs.readFile(filePath);
    const entries = parseZipEntries(buffer);
    const workbookEntry = entries.find(entry => entry.name === 'xl/workbook.xml');
    if (!workbookEntry) {
        throw new Error('Invalid XLSX file: missing workbook.xml');
    }
    return extractWorkbookSheets(readZipEntry(buffer, workbookEntry));
}

export function detectSourceType(filePath: string): LocalFileSourceType {
    const extension = path.extname(filePath).toLowerCase();
    const type = SUPPORTED_EXTENSIONS[extension];
    if (!type) {
        throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
    }
    return type;
}

export function normalizeRelationName(value: string, fallback = 'relation') {
    return normalizeIdentifier(value, fallback);
}

export function normalizeDatasetSchemaName(value: string, fallback = 'dataset') {
    return normalizeIdentifier(value, fallback);
}

export function fingerprintSourceStat(stat: LocalFileSourceStat) {
    return `${stat.backend}:${stat.path}:${stat.sizeBytes}:${Math.round(stat.mtimeMs)}:${stat.sourceType}`;
}

export const serverPathBackend: FileBackend = {
    name: 'serverPath',
    async statSource(source) {
        if (source.backend !== 'serverPath') {
            throw new Error(`serverPath backend cannot read ${source.backend} sources`);
        }
        const filePath = source.filePath.trim();
        if (!path.isAbsolute(filePath)) {
            throw new Error('Local file path must be absolute');
        }

        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
            throw new Error('Local file path must point to a file');
        }
        await fs.access(filePath, fsConstants.R_OK);

        return {
            backend: 'serverPath',
            path: filePath,
            sizeBytes: stat.size,
            mtimeMs: stat.mtimeMs,
            sourceType: detectSourceType(filePath),
        };
    },
    async openReadable(source): Promise<ReadStream> {
        const readPath = await this.resolveDuckdbPath(source);
        return createReadStream(readPath);
    },
    async resolveDuckdbPath(source) {
        const stat = await this.statSource(source);
        return stat.path;
    },
};

export function registerFileBackend(backend: FileBackend) {
    backends.set(backend.name, backend);
}

export function getFileBackend(name: LocalFileSourceBackend): FileBackend {
    return backends.get(name) ?? unsupportedBackend(name);
}

export function listFileBackends() {
    return [...backends.keys()];
}

for (const backend of [serverPathBackend]) {
    registerFileBackend(backend);
}

export async function statSource(source: LocalFileSourceDescriptor): Promise<LocalFileSourceStat> {
    return getFileBackend(sourceBackend(source)).statSource(source);
}

export async function openReadable(source: LocalFileSourceDescriptor): Promise<NodeJS.ReadableStream> {
    return getFileBackend(sourceBackend(source)).openReadable(source);
}

export async function resolveDuckDbReadPath(source: LocalFileSourceDescriptor): Promise<string> {
    return getFileBackend(sourceBackend(source)).resolveDuckdbPath(source);
}

export async function resolveDuckdbPath(source: LocalFileSourceDescriptor): Promise<string> {
    return resolveDuckDbReadPath(source);
}

export async function inspectSource(source: LocalFileSourceDescriptor, options?: { mode?: LocalFileRelationMode }): Promise<LocalFileRelationManifest[]> {
    const stat = await statSource(source);
    const duckdbPath = await resolveDuckDbReadPath(source);
    const sourceFingerprint = fingerprintSourceStat(stat);
    const mode = options?.mode ?? 'virtual';
    const used = new Set<string>();

    if (stat.sourceType === 'excel') {
        const sheets = await inspectExcelSheets(duckdbPath);
        if (!sheets.length) {
            throw new Error('Excel workbook has no sheets');
        }
        return sheets.map(sheetName => ({
            sourceType: 'excel',
            source,
            duckdbPath,
            sheetName,
            relationName: uniqueName(normalizeRelationName(sheetName, 'sheet'), used),
            mode,
            sourceFingerprint,
        }));
    }

    const parsed = path.parse(duckdbPath);
    return [
        {
            sourceType: stat.sourceType,
            source,
            duckdbPath,
            relationName: uniqueName(normalizeRelationName('data', parsed.name || 'data'), used),
            mode,
            sourceFingerprint,
        },
    ];
}

export function buildReadSql(relation: LocalFileRelationManifest): string {
    const filePath = quoteLiteral(relation.duckdbPath);
    switch (relation.sourceType) {
        case 'excel':
            if (!relation.sheetName) {
                throw new Error('Excel relation requires a sheet name');
            }
            return `SELECT * FROM read_xlsx(${filePath}, sheet = ${quoteLiteral(relation.sheetName)})`;
        case 'csv': {
            const extension = path.extname(relation.duckdbPath).toLowerCase();
            const delimiter = extension === '.tsv' ? `, delim = ${quoteLiteral('\t')}` : '';
            return `SELECT * FROM read_csv_auto(${filePath}${delimiter})`;
        }
        case 'parquet':
            return `SELECT * FROM read_parquet(${filePath})`;
        case 'json':
            return `SELECT * FROM read_json_auto(${filePath})`;
        default:
            throw new Error(`Unsupported source type: ${(relation as LocalFileRelationManifest).sourceType}`);
    }
}

export async function sampleSource(_source: LocalFileSourceDescriptor): Promise<Record<string, unknown>[]> {
    return [];
}
