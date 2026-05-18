'use client';

import * as React from 'react';
import { FileCode2, Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format as formatSql } from 'sql-formatter';

import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { splitQualifiedName, useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { cn } from '@dory/web-utils';
import type { ResponseObject } from '@dory/shared';
import type { DatabaseFunctionDependency, DatabaseFunctionDetail, DatabaseFunctionParameter, DatabaseFunctionReturnColumn } from '@dory/drivers/types';
import type { ExplorerResource } from '@/lib/explorer/types';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import type { SqlLanguage } from 'sql-formatter';

type FunctionViewProps = {
    resource: Extract<ExplorerResource, { kind: 'object' }>;
};

const NOT_AVAILABLE = 'Not available';

function formatKind(kind?: string | null) {
    switch (kind) {
        case 'scalar':
            return 'Scalar Function';
        case 'table':
            return 'Table-valued Function';
        case 'aggregate':
            return 'Aggregate Function';
        case 'procedure':
            return 'Procedure';
        case 'function':
            return 'Function';
        default:
            return 'Function';
    }
}

function formatDate(value?: string | null) {
    if (!value) return NOT_AVAILABLE;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function formatDependency(dep: DatabaseFunctionDependency) {
    return [dep.schema, dep.name].filter(Boolean).join('.') || dep.name;
}

function getFormatterLanguage(connectionType: string): SqlLanguage {
    switch (connectionType) {
        case 'clickhouse':
            return 'clickhouse';
        case 'duckdb':
            return 'duckdb';
        case 'mysql':
        case 'mariadb':
            return 'mysql';
        case 'postgres':
            return 'postgresql';
        case 'sqlite':
            return 'sqlite';
        case 'sqlserver':
            return 'transactsql';
        default:
            return 'sql';
    }
}

function formatDefinition(sql: string, language: SqlLanguage) {
    try {
        return formatSql(sql, { language });
    } catch {
        return sql;
    }
}

function ParameterList({ rows }: { rows: DatabaseFunctionParameter[] }) {
    if (!rows.length) {
        return <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{NOT_AVAILABLE}</div>;
    }

    return (
        <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Nullable</th>
                        <th className="px-3 py-2 text-left font-medium">Mode</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${row.name}-${index}`} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{row.dataType ?? NOT_AVAILABLE}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.nullable == null ? NOT_AVAILABLE : row.nullable ? 'NULL' : 'NOT NULL'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.mode ?? 'in'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ReturnColumns({ rows }: { rows: DatabaseFunctionReturnColumn[] }) {
    if (!rows.length) return null;

    return (
        <div className="mt-3 overflow-hidden rounded-md border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                        <th className="px-3 py-2 text-left font-medium">Column</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Nullable</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${row.name}-${index}`} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{row.dataType ?? NOT_AVAILABLE}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.nullable == null ? NOT_AVAILABLE : row.nullable ? 'NULL' : 'NOT NULL'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DependencyList({ title, rows }: { title: string; rows: DatabaseFunctionDependency[] }) {
    return (
        <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
            {rows.length ? (
                <div className="space-y-1.5">
                    {rows.map((row, index) => (
                        <div key={`${title}-${row.schema}-${row.name}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className="font-mono text-xs">{formatDependency(row)}</span>
                            {row.type && <Badge variant="secondary">{row.type}</Badge>}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{NOT_AVAILABLE}</div>
            )}
        </div>
    );
}

export function FunctionView({ resource }: FunctionViewProps) {
    const router = useRouter();
    const { connectionId, connectionType, organizationId } = useExplorerConnectionContext();
    const [detail, setDetail] = React.useState<DatabaseFunctionDetail | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const formatterLanguage = getFormatterLanguage(connectionType);
    const definition = React.useMemo(() => (detail?.definition ? formatDefinition(detail.definition, formatterLanguage) : NOT_AVAILABLE), [detail?.definition, formatterLanguage]);

    React.useEffect(() => {
        let cancelled = false;
        async function loadDetail() {
            if (!connectionId) return;
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                if (resource.schema) params.set('schema', resource.schema);
                const response = await authFetch(
                    `/api/connection/${connectionId}/databases/${encodeURIComponent(resource.database)}/functions/${encodeURIComponent(resource.name)}${params.size ? `?${params.toString()}` : ''}`,
                    {
                        method: 'GET',
                        headers: {
                            'X-Connection-ID': connectionId,
                        },
                    },
                );
                const result = (await response.json()) as ResponseObject<DatabaseFunctionDetail>;
                if (!isSuccess(result)) throw new Error(result.message || 'Failed to load function detail');
                if (!cancelled) setDetail(result.data ?? null);
            } catch (err) {
                if (!cancelled) {
                    setDetail(null);
                    setError(err instanceof Error ? err.message : 'Failed to load function detail');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadDetail();
        return () => {
            cancelled = true;
        };
    }, [connectionId, resource.database, resource.name, resource.schema]);

    const openSqlConsole = React.useCallback(
        (sql: string, tabName?: string) => {
            if (!organizationId || !connectionId) return;
            localStorage.setItem(
                'chatbot:pending-sql',
                JSON.stringify({
                    sql,
                    database: resource.database,
                    mode: 'editor',
                    tabName,
                }),
            );
            router.push(`/${encodeURIComponent(organizationId)}/${encodeURIComponent(connectionId)}/sql-console`);
        },
        [connectionId, organizationId, resource.database, router],
    );

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading function detail
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div className="p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{resource.name}</CardTitle>
                        <CardDescription>Function detail is unavailable.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">{error ?? NOT_AVAILABLE}</CardContent>
                </Card>
            </div>
        );
    }

    const signature = detail.signature ?? detail.qualifiedName;
    const callSql = detail.sampleCallSql ?? `SELECT ${detail.qualifiedName}();`;
    const unqualified = splitQualifiedName(detail.qualifiedName).name;

    return (
        <div className="min-h-full bg-background p-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-5">
                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle className="break-all font-mono text-2xl">{unqualified}</CardTitle>
                                    <Badge variant="outline">{formatKind(detail.kind)}</Badge>
                                </div>
                                <CardDescription className="break-all font-mono text-sm">{signature}</CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <CopyButton text={callSql} variant="outline" size="sm" label="Copy" />
                                <Button size="sm" onClick={() => openSqlConsole(callSql, `Run ${detail.name}`)}>
                                    <Play className="h-4 w-4" />
                                    Run Function
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                            {[
                                ['Schema', detail.schema ?? NOT_AVAILABLE],
                                ['Owner', detail.owner ?? NOT_AVAILABLE],
                                ['Created', formatDate(detail.createdAt)],
                                ['Modified', formatDate(detail.modifiedAt)],
                                ['Name', detail.qualifiedName],
                            ].map(([label, value]) => (
                                <div key={label} className="min-w-0 rounded-md border bg-muted/20 px-3 py-2">
                                    <div className="text-xs text-muted-foreground">{label}</div>
                                    <div className="truncate font-medium" title={value}>
                                        {value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardHeader>
                </Card>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-5">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Parameters</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ParameterList rows={detail.parameters} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Returns</CardTitle>
                                <CardDescription className="font-mono">{detail.returnType ?? NOT_AVAILABLE}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ReturnColumns rows={detail.returnColumns} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex-row items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base">Definition</CardTitle>
                                    <CardDescription>Source definition from database metadata.</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openSqlConsole(definition, detail.name)} disabled={!detail.definition}>
                                        <FileCode2 className="h-4 w-4" />
                                        Open in SQL Console
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <SmartCodeBlock value={definition} type="sql" showLineNumbers maxHeightClassName="max-h-[560px]" />
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-5">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Dependencies</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <DependencyList title="Depends On" rows={detail.dependencies} />
                                <Separator />
                                <DependencyList title="Used By" rows={detail.usedBy} />
                            </CardContent>
                        </Card>

                        <Card className={cn(!detail.sampleCallSql && 'opacity-80')}>
                            <CardHeader>
                                <CardTitle className="text-base">Sample Call</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <SmartCodeBlock value={callSql} type="sql" maxHeightClassName="max-h-44" />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
