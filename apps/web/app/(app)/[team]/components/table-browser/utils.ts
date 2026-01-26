import { ColumnInfo } from "./type";

export function buildColumnCacheKey(connectionId?: string, databaseName?: string, tableName?: string) {
    if (!connectionId || !databaseName || !tableName) return null;
    return `${connectionId}::${databaseName}::${tableName}`;
}

export function computeColumnsHash(
    connectionId: string | undefined,
    databaseName: string,
    tableName: string,
    columns: ColumnInfo[],
) {
    const payload = {
        connectionId: connectionId ?? 'unknown',
        databaseName,
        tableName,
        columns: columns.map(col => ({
            name: col.name,
            type: col.type,
            nullable: !!col.nullable,
            defaultValue: col.defaultValue ?? null,
            comment: col.comment ?? null,
        })),
    };

    const input = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0; // 32-bit
    }
    return `${Math.abs(hash)}`;
}
