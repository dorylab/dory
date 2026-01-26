// lib/client/pglite/bytea.ts
import { customType as pgCustomType } from 'drizzle-orm/pg-core';

export type ByteLike =
    | Uint8Array
    | ArrayBuffer
    // @ts-ignore Buffer exists in Node; this is for type compatibility only
    | (typeof Buffer extends { from: any } ? Buffer : never);

export const pgBytea = pgCustomType<{
    data: ByteLike;
    driverData: unknown;
}>({
    dataType: () => 'bytea',
    fromDriver: (v: any) => (v instanceof Uint8Array ? v : new Uint8Array(v)),
    toDriver: (v: ByteLike) => {
        // Prefer Buffer in Node; use Uint8Array in browser
        // @ts-ignore
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
            // @ts-ignore
            if (Buffer.isBuffer?.(v)) return v;
            if (v instanceof Uint8Array) {
                // @ts-ignore
                return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
            }
            if (v instanceof ArrayBuffer) {
                // @ts-ignore
                return Buffer.from(v);
            }
        }
        return v instanceof ArrayBuffer ? new Uint8Array(v) : (v as Uint8Array);
    },
});
