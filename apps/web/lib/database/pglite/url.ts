import { fileURLToPath, pathToFileURL } from 'node:url';

export function ensureFileUrl(value: string): string {
    if (value.startsWith('file://')) return value;
    if (value.startsWith('file:')) {
        return `file://${value.slice('file:'.length)}`;
    }
    return pathToFileURL(value).href;
}

export function extractFilePath(value: string): string {
    if (value.startsWith('file://')) {
        return fileURLToPath(value);
    }
    if (value.startsWith('file:')) {
        return fileURLToPath(ensureFileUrl(value));
    }
    return value;
}
