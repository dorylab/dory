import { customType } from 'drizzle-orm/pg-core';

export const pgBytea = customType<{
    data: Uint8Array | Buffer;
    driverData: unknown;
}>({
    dataType: () => 'bytea',
    fromDriver: value => {
        if (value instanceof Uint8Array) return value;
        return Buffer.isBuffer(value) ? value : Buffer.from(value as ArrayBuffer);
    },
    toDriver: value => value,
});
