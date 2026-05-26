import { getToolName } from './message-tool-compat';
import { formatToolValue, getObjectKeys } from './message-render-utils';

type DoryToolContentProps = {
    part: any;
    state: string;
    input: any;
    output: any;
    errorText?: string;
};

function MetaItems({ items }: { items: Array<[string, unknown]> }) {
    const visibleItems = items.filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (visibleItems.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5">
            {visibleItems.map(([label, value]) => (
                <span key={label} className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-[12px] text-muted-foreground">
                    <span>{label}</span>
                    <span className="font-medium text-foreground/80">{formatToolValue(value)}</span>
                </span>
            ))}
        </div>
    );
}

function CompactRows({ rows, columns }: { rows: Array<Record<string, unknown>>; columns?: string[] }) {
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">No rows returned.</p>;

    const displayRows = rows.slice(0, 5);
    const displayColumns = (columns?.length ? columns : getObjectKeys(displayRows)).slice(0, 6);

    return (
        <div className="overflow-hidden rounded-lg border border-border/45 bg-background/70">
            <table className="w-full min-w-max text-sm">
                <thead>
                    <tr>
                        {displayColumns.map(column => (
                            <th key={column} className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {displayRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="even:bg-muted/[0.16]">
                            {displayColumns.map(column => (
                                <td key={column} className="h-9 border-b border-border/35 px-3 align-middle text-[12px] text-foreground/80 last:border-b-0">
                                    {formatToolValue(row[column])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length > displayRows.length ? (
                <div className="border-t border-border/35 px-3 py-2 text-[11px] text-muted-foreground">
                    Showing {displayRows.length} of {rows.length} rows.
                </div>
            ) : null}
        </div>
    );
}

function ColumnsSummary({ columns }: { columns: any[] }) {
    return (
        <div className="overflow-hidden rounded-lg border border-border/45 bg-background/70">
            <table className="w-full min-w-max text-sm">
                <thead>
                    <tr>
                        <th className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">Column</th>
                        <th className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">Type</th>
                        <th className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">Key</th>
                    </tr>
                </thead>
                <tbody>
                    {columns.slice(0, 12).map((column, index) => (
                        <tr key={`${column?.columnName ?? column?.name ?? index}`} className="even:bg-muted/[0.16]">
                            <td className="h-9 border-b border-border/35 px-3 align-middle text-[12px] font-medium text-foreground/85">
                                {formatToolValue(column?.columnName ?? column?.name)}
                            </td>
                            <td className="h-9 border-b border-border/35 px-3 align-middle text-[12px] text-muted-foreground">
                                {formatToolValue(column?.columnType ?? column?.type)}
                            </td>
                            <td className="h-9 border-b border-border/35 px-3 align-middle text-[12px] text-muted-foreground">{column?.isPrimaryKey ? 'Primary' : '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {columns.length > 12 ? <div className="border-t border-border/35 px-3 py-2 text-[11px] text-muted-foreground">Showing 12 of {columns.length} columns.</div> : null}
        </div>
    );
}

export function DoryToolContent({ part, state, input, output, errorText }: DoryToolContentProps) {
    const toolName = getToolName(part);

    if (state === 'input-streaming' || state === 'input-available') {
        return (
            <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Running this tool.</p>
                <MetaItems
                    items={[
                        ['Database', input?.database],
                        ['Table', input?.table],
                        ['Limit', input?.limit],
                        ['Query', input?.query],
                    ]}
                />
            </div>
        );
    }

    if (state === 'output-error') {
        return <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">{errorText || 'Tool failed.'}</div>;
    }

    const result = output && typeof output === 'object' ? output : {};
    const ok = (result as any).ok !== false;
    const toolOutput = (result as any).ok === true ? result : output;

    if (!ok) {
        return (
            <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
                {formatToolValue((result as any).error?.message ?? errorText ?? 'Tool failed.')}
            </div>
        );
    }

    if (toolName === 'chartBuilder') {
        const chart = (toolOutput as any)?.type === 'chart' ? (toolOutput as any) : (result as any);
        const rows = Array.isArray(chart?.data) ? chart.data : [];
        const yKeys = Array.isArray(chart?.yKeys) ? chart.yKeys.map((item: any) => item?.label ?? item?.key).filter(Boolean) : [];
        const valueFields = chart?.valueKey ?? (yKeys.length > 0 ? yKeys.join(', ') : undefined);

        return (
            <div className="space-y-2.5">
                {chart?.title ? <p className="text-sm font-medium text-foreground/85">{formatToolValue(chart.title)}</p> : null}
                <MetaItems
                    items={[
                        ['Chart', chart?.chartType ?? input?.chartType],
                        ['Rows', rows.length || input?.dataCount],
                        ['Category', chart?.categoryKey],
                        ['X', chart?.categoryKey ? undefined : chart?.xKey],
                        ['Value', valueFields],
                    ]}
                />
            </div>
        );
    }

    if (toolName === 'describeTable') {
        const columns = Array.isArray((toolOutput as any)?.columns) ? (toolOutput as any).columns : [];
        return (
            <div className="space-y-2.5">
                <MetaItems
                    items={[
                        ['Database', input?.database],
                        ['Table', input?.table],
                        ['Columns', columns.length],
                    ]}
                />
                {columns.length > 0 ? <ColumnsSummary columns={columns} /> : <p className="text-sm text-muted-foreground">No columns returned.</p>}
            </div>
        );
    }

    if (toolName === 'previewTable') {
        const resultSets = Array.isArray((toolOutput as any)?.queryResultSets) ? (toolOutput as any).queryResultSets : [];
        const firstSet = resultSets[0] ?? {};
        const rows = Array.isArray((toolOutput as any)?.results?.[0]) ? (toolOutput as any).results[0] : [];
        const columnNames = Array.isArray(firstSet?.columns) ? firstSet.columns.map((column: any) => column?.name ?? column?.columnName).filter(Boolean) : undefined;

        return (
            <div className="space-y-2.5">
                <MetaItems
                    items={[
                        ['Database', input?.database ?? (toolOutput as any)?.session?.database],
                        ['Table', input?.table],
                        ['Rows', rows.length],
                        ['Limit', firstSet?.limit ?? input?.limit],
                    ]}
                />
                <CompactRows rows={rows} columns={columnNames} />
            </div>
        );
    }

    if (toolName === 'listTables') {
        const tables = Array.isArray((toolOutput as any)?.tables) ? (toolOutput as any).tables : [];
        return (
            <div className="space-y-2.5">
                <MetaItems
                    items={[
                        ['Database', input?.database],
                        ['Tables', tables.length],
                    ]}
                />
                <div className="flex flex-wrap gap-1.5">
                    {tables.slice(0, 24).map((table: any, index: number) => (
                        <span key={`${table?.name ?? table?.value ?? index}`} className="rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-[12px] text-foreground/80">
                            {formatToolValue(table?.name ?? table?.label ?? table?.value ?? table)}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    if (toolName === 'listConnections') {
        const connections = Array.isArray((toolOutput as any)?.connections) ? (toolOutput as any).connections : [];
        return (
            <div className="space-y-2.5">
                <MetaItems items={[['Connections', connections.length]]} />
                <CompactRows
                    rows={connections.map((connection: any) => ({
                        name: connection.name,
                        type: connection.type ?? connection.engine,
                        database: connection.database,
                        status: connection.status ?? connection.lastCheckStatus,
                    }))}
                    columns={['name', 'type', 'database', 'status']}
                />
            </div>
        );
    }

    if (toolName === 'searchSchema') {
        const results = Array.isArray((toolOutput as any)?.results) ? (toolOutput as any).results : [];
        return (
            <div className="space-y-2.5">
                <MetaItems
                    items={[
                        ['Query', input?.query],
                        ['Matches', results.length],
                    ]}
                />
                <CompactRows
                    rows={results.map((item: any) => ({
                        kind: item.kind,
                        database: item.database,
                        table: item.table ?? item.name,
                        column: item.kind === 'column' ? item.name : null,
                        type: item.type ?? null,
                    }))}
                    columns={['kind', 'database', 'table', 'column', 'type']}
                />
            </div>
        );
    }

    if (toolName === 'listSavedQueries') {
        const savedQueries = Array.isArray((toolOutput as any)?.savedQueries) ? (toolOutput as any).savedQueries : [];
        return savedQueries.length > 0 ? (
            <CompactRows
                rows={savedQueries.map((query: any) => ({
                    title: query.title,
                    folder: query.folderId,
                    updated: query.updatedAt,
                }))}
                columns={['title', 'folder', 'updated']}
            />
        ) : (
            <p className="text-sm text-muted-foreground">No saved queries returned.</p>
        );
    }

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Tool completed.</p>
            <MetaItems
                items={[
                    ['Database', input?.database],
                    ['Table', input?.table],
                    ['Limit', input?.limit],
                ]}
            />
        </div>
    );
}
