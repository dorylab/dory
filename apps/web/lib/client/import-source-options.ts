import type { CsvEncoding, CsvParsingOptions, ImportSourceFormat, ImportSourceOptions } from '@dory/import';

const CSV_DELIMITERS: CsvParsingOptions['delimiter'][] = [',', '\t', ';', '|'];
const CSV_ENCODINGS: CsvEncoding[] = ['utf8', 'utf16le', 'utf16be', 'gb18030', 'big5', 'shift_jis', 'windows1252'];

export function readStoredImportSourceOptions(value: unknown): ImportSourceOptions | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.format === 'parquet' || candidate.format === 'ndjson' || candidate.format === 'arrow') return { format: candidate.format };
    if (candidate.format !== 'csv') return null;
    const parsing = readCsvParsing(candidate);
    return parsing ? { format: 'csv', ...parsing } : null;
}

export function recoverStoredImportSourceOptions(value: unknown, sourceName: string | null, sourceExtension: string | null): ImportSourceOptions | null {
    const format = importSourceFormatForFileName(sourceName ?? '', sourceExtension);
    if (!format) return null;
    if (format !== 'csv') return { format };
    const parsing = readCsvParsing(value);
    return parsing ? { format: 'csv', ...parsing } : null;
}

export function importSourceFormatForFileName(fileName: string, extension?: string | null): ImportSourceFormat | null {
    const normalized = (extension || fileName.split('.').pop() || '').toLowerCase();
    if (normalized === 'csv' || normalized === 'tsv') return 'csv';
    if (normalized === 'parquet') return 'parquet';
    if (normalized === 'ndjson' || normalized === 'jsonl') return 'ndjson';
    if (normalized === 'arrow' || normalized === 'ipc' || normalized === 'feather') return 'arrow';
    return null;
}

function readCsvParsing(value: unknown): CsvParsingOptions | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (!CSV_DELIMITERS.includes(candidate.delimiter as CsvParsingOptions['delimiter'])) return null;
    if (typeof candidate.hasHeader !== 'boolean' || !CSV_ENCODINGS.includes(candidate.encoding as CsvEncoding)) return null;
    if (typeof candidate.quoteChar !== 'string' || [...candidate.quoteChar].length !== 1) return null;
    return {
        delimiter: candidate.delimiter as CsvParsingOptions['delimiter'],
        hasHeader: candidate.hasHeader,
        encoding: candidate.encoding as CsvEncoding,
        quoteChar: candidate.quoteChar,
    };
}
