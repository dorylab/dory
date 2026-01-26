// /lib/client/binary-codec.ts — works in both browser and Web Worker
import { ENABLE_COMPRESSION } from '@/app/config/sql-console';
import { gzip, ungzip } from 'pako';

export const COMPRESS_THRESHOLD = 512; // < 512B: no compression

// —— Safe JSON: supports bigint (store as "123n", restore on parse) ——
function jsonStringifySafe(value: any): string {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
}
function jsonParseSafe(str: string): any {
    return JSON.parse(str, (_k, v) => {
        if (typeof v === 'string' && /^-?\d+n$/.test(v)) {
            try {
                return BigInt(v.slice(0, -1));
            } catch {
                /* ignore */
            }
        }
        return v;
    });
}

// —— Core: encode any payload (single row or full page) ——
export function encodePayload(payload: any, compress = ENABLE_COMPRESSION): { data: Uint8Array; isGzip: boolean } {
    const json = jsonStringifySafe(payload ?? null);
    const u8 = new TextEncoder().encode(json);

    if (!compress || u8.length < COMPRESS_THRESHOLD) {
        return { data: u8, isGzip: false };
    }
    try {
        const gz = gzip(u8); // Use module gzip (works in Worker/SSR too)
        // Only gzip when smaller to avoid inflating small payloads
        if (gz && gz.length < u8.length) return { data: gz, isGzip: true };
    } catch {
        /* Ignore compression failures and use raw bytes */
    }
    return { data: u8, isGzip: false };
}

// —— Decode counterpart ——
export function decodePayload(u8: Uint8Array, isGzip: boolean): any {
    const bytes = isGzip ? ungzip(u8) : u8;
    const json = new TextDecoder().decode(bytes);
    return jsonParseSafe(json);
}

// —— Keep naming compatibility: single row or full page ——
export const encodeRow = encodePayload;
export const decodeRow = decodePayload;
export const encodeRows = (rows: any[], compress = ENABLE_COMPRESSION) => encodePayload(rows, compress);

// —— Clone ArrayBuffer from Uint8Array (avoid shared backing buffer) ——
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer | SharedArrayBuffer {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}
