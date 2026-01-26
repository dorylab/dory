// —— schemaHash computation ——

import { ColumnInput } from "@/types";

// Web Crypto works in both Edge and Node
export async function computeSchemaHash(input: {
    dbType?: string | null;
    catalog?: string | null;
    database?: string | null;
    table?: string | null;
    columns: ColumnInput[];
}) {
    const normalized = {
        dbType: input.dbType ?? null,
        catalog: input.catalog ?? 'default',
        database: input.database ?? null,
        table: input.table ?? null,
        columns: [...input.columns].map(col => ({
            name: col.name,
            type: col.type ?? null,
            comment: col.comment ?? null,
            defaultValue: col.defaultValue ?? null,
            nullable: col.nullable ?? null,
        })),
    };

    // Stable sort to avoid ordering jitter
    normalized.columns.sort((a, b) => a.name.localeCompare(b.name));

    const json = JSON.stringify(normalized);
    const data = new TextEncoder().encode(json);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(digest));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
