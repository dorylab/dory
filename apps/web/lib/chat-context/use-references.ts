'use client';

import type { ConnectionType } from '@dory/shared/types/connections';
import { getSidebarConfig } from '@/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config';
import { isHiddenDatabase } from '@/app/(app)/[organization]/components/sql-console-sidebar/utils';
import type { DatabaseObjectRow } from '@dory/drivers/types';
import type { AnalysisScope, WorkDocumentSummary } from '@dory/shared/types/work-document';
import { useQueries, useQuery } from '@tanstack/react-query';

import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactSummary } from '@/lib/artifacts/types';
import { workRequest } from '@/lib/work-documents/client';
import { querySnapshotOptions } from '@/lib/agent-runs/query-snapshot';
import { referenceKey, type ChatReference } from './types';

export type ReferenceOption = { reference: ChatReference; detail: string; current?: boolean };

export function useChatReferences(organization: string, chatId: string | null, scope: AnalysisScope, search: string | null, runIds: string[]) {
    const enabled = search !== null;
    const category = /^(table|report|artifact)(?:\s|$)/i.exec(search ?? '')?.[1]?.toLowerCase();
    const query = (category ? search!.slice(category.length) : (search ?? '')).trim();
    const automatic = scope.connectionMode === 'auto' || (!scope.connectionMode && !scope.connectionIds.length);
    const discoverDatabases = automatic || scope.connectionIds.some(id => !scope.databasesByConnection?.[id]);
    const discovery = useQuery({
        queryKey: ['chat-auto-sources', organization],
        enabled: enabled && discoverDatabases && (!category || category === 'table'),
        queryFn: () => workRequest<{ connections: Array<{ id: string; name: string; type: ConnectionType }> }>('/api/data-agent'),
        staleTime: 60_000,
    });
    const autoTables = useQueries({
        queries: (discovery.data?.connections ?? [])
            .filter(connection => automatic || (scope.connectionIds.includes(connection.id) && !scope.databasesByConnection?.[connection.id]))
            .map(connection => ({
                queryKey: ['chat-auto-tables', organization, connection.id],
                enabled: enabled && discoverDatabases && (!category || category === 'table'),
                staleTime: 60_000,
                queryFn: async ({ signal }: { signal: AbortSignal }) => {
                    const result = await executeActionClient<{ databases: Array<{ value?: string; name?: string; label?: string }> }>(
                        'schema.listDatabases',
                        { connectionId: connection.id },
                        { signal },
                    );
                    const options: ReferenceOption[] = [];
                    for (const item of result.databases ?? []) {
                        const database = item.value ?? item.name ?? item.label;
                        if (!database || isHiddenDatabase(database, getSidebarConfig(connection.type))) continue;
                        const [result, views] = await Promise.all([
                            executeActionClient<{ tables: DatabaseObjectRow[] }>('schema.listTables', { connectionId: connection.id, database }, { signal }),
                            executeActionClient<{ views: DatabaseObjectRow[] }>('schema.listViews', { connectionId: connection.id, database }, { signal }).catch(() => ({
                                views: [],
                            })),
                        ]);
                        options.push(
                            ...[...result.tables, ...(views.views ?? [])].map(table => ({
                                reference: {
                                    kind: 'table' as const,
                                    connectionId: connection.id,
                                    database,
                                    schema: table.schema ?? null,
                                    table: table.value ?? table.name,
                                    title: table.label ?? table.name,
                                },
                                detail: [connection.name, database, table.schema].filter(Boolean).join(' / '),
                            })),
                        );
                    }
                    return options;
                },
            })),
    });
    const tables = useQueries({
        queries: (automatic ? [] : scope.connectionIds.filter(id => Boolean(scope.databasesByConnection?.[id]))).map(connectionId => ({
            queryKey: ['chat-tables', organization, connectionId, scope.databasesByConnection?.[connectionId]],
            enabled: enabled && (!category || category === 'table') && Boolean(scope.databasesByConnection?.[connectionId]),
            staleTime: 60_000,
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
                const database = scope.databasesByConnection![connectionId];
                const [tables, views] = await Promise.all([
                    executeActionClient<{ tables: DatabaseObjectRow[] }>('schema.listTables', { connectionId, database }, { signal }),
                    executeActionClient<{ views: DatabaseObjectRow[] }>('schema.listViews', { connectionId, database }, { signal }).catch(() => ({ views: [] })),
                ]);
                return [...tables.tables, ...views.views].map(table => ({
                    reference: { kind: 'table' as const, connectionId, database, schema: table.schema ?? null, table: table.value ?? table.name, title: table.label ?? table.name },
                    detail: [connectionId, database, table.schema].filter(Boolean).join(' / '),
                }));
            },
        })),
    });
    const reports = useQuery({
        queryKey: ['chat-report-references', organization, chatId, query],
        enabled: enabled && (!category || category === 'report'),
        queryFn: async () => {
            const [all, current] = await Promise.all([
                workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?q=${encodeURIComponent(query)}`),
                chatId
                    ? workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?chatId=${encodeURIComponent(chatId)}&q=${encodeURIComponent(query)}`)
                    : Promise.resolve({ documents: [] }),
            ]);
            return { documents: [...new Map([...current.documents, ...all.documents].map(document => [document.id, document])).values()] };
        },
    });
    const artifacts = useQuery({
        queryKey: ['chat-artifact-references', organization, query],
        enabled: enabled && (!category || category === 'artifact'),
        queryFn: ({ signal }) => executeActionClient<{ rows: ArtifactSummary[] }>('artifact.list', { query, limit: 100, forChatReference: true }, { signal }),
    });
    const currentArtifacts = useQueries({ queries: runIds.map(id => ({ ...querySnapshotOptions(organization, id), enabled: enabled && (!category || category === 'artifact') })) });
    const artifactOptions = [...currentArtifacts.flatMap(item => item.data?.artifacts ?? []), ...(artifacts.data?.rows ?? [])];
    const candidates: ReferenceOption[] = [
        ...(!category || category === 'table' ? [...tables, ...autoTables].flatMap(item => item.data ?? []) : []),
        ...(!category || category === 'report'
            ? (reports.data?.documents ?? []).map(report => ({
                  reference: { kind: 'report' as const, id: report.id, title: report.title },
                  detail: `Report · v${report.revision}`,
                  current: report.chatId === chatId,
              }))
            : []),
        ...(!category || category === 'artifact'
            ? artifactOptions
                  .filter(item => item.status === 'ready')
                  .map(artifact => ({
                      reference: { kind: 'artifact' as const, id: artifact.id, title: artifact.title },
                      detail: [artifact.type, artifact.connectionName].filter(Boolean).join(' · '),
                      current: Boolean(artifact.workId && runIds.includes(artifact.workId)),
                  }))
            : []),
    ];
    const options = [
        ...new Map(
            candidates.filter(item => `${item.reference.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())).map(item => [referenceKey(item.reference), item]),
        ).values(),
    ].sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
    const queries = [discovery, ...autoTables, ...tables, reports, artifacts, ...currentArtifacts];
    return {
        options,
        loading: queries.some(item => item.isFetching),
        error: queries.find(item => item.error)?.error,
        retry: () => queries.filter(item => item.isError).forEach(item => void item.refetch()),
    };
}
