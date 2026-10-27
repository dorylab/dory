'use client';

import { getAnalysisDatabases } from '@dory/shared/utils/analysis-scope';
import type { ConnectionType } from '@dory/shared/types/connections';
import { getSidebarConfig } from '@/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config';
import { isHiddenDatabase } from '@/app/(app)/[organization]/components/sql-console-sidebar/utils';
import type { DatabaseObjectRow } from '@dory/drivers/types';
import type { AnalysisScope, WorkDocumentSummary } from '@dory/shared/types/work-document';
import { useQueries, useQuery } from '@tanstack/react-query';

import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactDetail, ArtifactSummary } from '@/lib/artifacts/types';
import { workRequest } from '@/lib/work-documents/client';
import { querySnapshotOptions } from '@/lib/agent-runs/query-snapshot';
import { referenceKey } from './types';
import { rankReferences, referenceInScope, type ReferenceOption, type ReferenceCategory } from './mentions';
import type { RecentReference } from './recent-references';
export type { ReferenceOption } from './mentions';

export function useChatReferences(
    organization: string,
    chatId: string | null,
    scope: AnalysisScope,
    search: string | null,
    runIds: string[],
    category: ReferenceCategory = null,
    recent: RecentReference[] = [],
    sourceNames: Record<string, string> = {},
) {
    const enabled = search !== null;
    const query = (search ?? '').trim();
    const needTables = Boolean(query || category === 'table' || recent.some(item => item.reference.kind === 'table'));
    const automatic = scope.connectionMode === 'auto' || (!scope.connectionMode && !scope.connectionIds.length);
    const discoverDatabases = automatic || scope.connectionIds.some(id => getAnalysisDatabases(scope, id) === undefined);
    const discovery = useQuery({
        queryKey: ['chat-auto-sources', organization],
        enabled: enabled && needTables && discoverDatabases && (!category || category === 'table'),
        queryFn: () => workRequest<{ connections: Array<{ id: string; name: string; type: ConnectionType }> }>('/api/data-agent'),
        staleTime: 60_000,
    });
    const autoTables = useQueries({
        queries: (discovery.data?.connections ?? [])
            .filter(connection => automatic || (scope.connectionIds.includes(connection.id) && getAnalysisDatabases(scope, connection.id) === undefined))
            .map(connection => ({
                queryKey: ['chat-auto-tables', organization, connection.id],
                enabled: enabled && needTables && discoverDatabases && (!category || category === 'table'),
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
        queries: (automatic
            ? []
            : scope.connectionIds.flatMap(connectionId => (getAnalysisDatabases(scope, connectionId) ?? []).map(database => ({ connectionId, database })))
        ).map(({ connectionId, database }) => ({
            queryKey: ['chat-tables', organization, connectionId, database],
            enabled: enabled && needTables && (!category || category === 'table'),
            staleTime: 60_000,
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
                const [tables, views] = await Promise.all([
                    executeActionClient<{ tables: DatabaseObjectRow[] }>('schema.listTables', { connectionId, database }, { signal }),
                    executeActionClient<{ views: DatabaseObjectRow[] }>('schema.listViews', { connectionId, database }, { signal }).catch(() => ({ views: [] })),
                ]);
                return [...tables.tables, ...views.views].map(table => ({
                    reference: { kind: 'table' as const, connectionId, database, schema: table.schema ?? null, table: table.value ?? table.name, title: table.label ?? table.name },
                    detail: [sourceNames[connectionId] ?? connectionId, database, table.schema].filter(Boolean).join(' / '),
                }));
            },
        })),
    });
    const reports = useQuery({
        queryKey: ['chat-report-references', organization, chatId, query],
        enabled: enabled && (!category || category === 'report'),
        queryFn: async ({ signal }) => {
            const [all, current] = await Promise.all([
                workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?q=${encodeURIComponent(query)}`, undefined, signal),
                chatId
                    ? workRequest<{ documents: WorkDocumentSummary[] }>(
                          `/api/work-documents?chatId=${encodeURIComponent(chatId)}&q=${encodeURIComponent(query)}`,
                          undefined,
                          signal,
                      )
                    : Promise.resolve({ documents: [] }),
            ]);
            return { documents: [...new Map([...current.documents, ...all.documents].map(document => [document.id, document])).values()] };
        },
    });
    const artifacts = useQuery({
        queryKey: ['chat-artifact-references', organization, query],
        enabled: enabled && (!category || category === 'result_set'),
        queryFn: ({ signal }) => executeActionClient<{ rows: ArtifactSummary[] }>('artifact.list', { query, limit: 100, forChatReference: true }, { signal }),
    });
    const currentArtifacts = useQueries({
        queries: runIds.map(id => ({ ...querySnapshotOptions(organization, id), enabled: enabled && (!category || category === 'result_set') })),
    });
    const artifactOptions = [...currentArtifacts.flatMap(item => (item.isError ? [] : (item.data?.artifacts ?? []))), ...(artifacts.isError ? [] : (artifacts.data?.rows ?? []))];
    const candidates: ReferenceOption[] = [
        ...(needTables && (!category || category === 'table') ? [...tables, ...autoTables].flatMap(item => (item.isError ? [] : (item.data ?? []))) : []),
        ...(!category || category === 'report'
            ? (reports.isError ? [] : (reports.data?.documents ?? [])).map(report => ({
                  reference: { kind: 'report' as const, id: report.id, title: report.title, revision: report.revision },
                  detail: `Report · v${report.revision}`,
                  current: Boolean(chatId && report.chatId === chatId),
                  timestamp: report.updatedAt,
              }))
            : []),
        ...(!category || category === 'result_set'
            ? artifactOptions
                  .filter(item => item.status === 'ready' && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))
                  .map(artifact => ({
                      reference: { kind: 'artifact' as const, id: artifact.id, title: artifact.title },
                      detail: artifactDetail(artifact),
                      artifactType: artifact.type,
                      timestamp: artifact.createdAt,
                      current: Boolean((artifact.workId && runIds.includes(artifact.workId)) || (artifact.agentRunId && runIds.includes(artifact.agentRunId))),
                  }))
            : []),
    ];
    const recentDetails = useQueries({
        queries: recent
            .filter(item => item.reference.kind !== 'table' && referenceInScope(item.reference, scope))
            .map(item => ({
                queryKey: ['chat-recent-resource', organization, chatId, referenceKey(item.reference)],
                enabled: enabled && !query && !category,
                staleTime: 0,
                retry: false,
                queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ReferenceOption | null> => {
                    const ref = item.reference;
                    if (ref.kind === 'report') {
                        const { document } = await workRequest<{ document: WorkDocumentSummary }>(
                            `/api/work-documents/${encodeURIComponent(ref.id)}${ref.revision ? `?revision=${ref.revision}` : ''}`,
                            undefined,
                            signal,
                        );
                        if (document.archivedAt) return null;
                        return { reference: { ...ref, title: document.title, revision: document.revision }, detail: `Report · v${document.revision}`, recentAt: item.usedAt };
                    }
                    if (ref.kind !== 'artifact') return null;
                    const artifact = await executeActionClient<ArtifactDetail>('artifact.get', { artifactId: ref.id }, { signal });
                    if (
                        artifact.status !== 'ready' ||
                        (artifact.expiresAt && Date.parse(artifact.expiresAt) <= Date.now()) ||
                        ('resultSet' in artifact && artifact.resultSet?.dataAvailability === 'none')
                    )
                        return null;
                    return { reference: { ...ref, title: artifact.title }, detail: artifactDetail(artifact), artifactType: artifact.type, recentAt: item.usedAt };
                },
            })),
    });
    const recentTimes = new Map(recent.map(item => [referenceKey(item.reference), item.usedAt]));
    const options = rankReferences(
        [
            ...candidates
                .filter(option => referenceInScope(option.reference, scope))
                .map(option => ({ ...option, recentAt: query || category || option.reference.kind === 'table' ? recentTimes.get(referenceKey(option.reference)) : undefined })),
            ...(!query && !category ? recentDetails.flatMap(result => (result.isSuccess && !result.isFetching && result.data ? [result.data] : [])) : []),
        ],
        query,
        category,
    );
    const queries = [discovery, ...autoTables, ...tables, reports, artifacts, ...currentArtifacts];
    return {
        options,
        loading: queries.some(item => item.isFetching) || recentDetails.some(item => item.isFetching),
        error: queries.find(item => item.error)?.error,
        retry: () => queries.filter(item => item.isError).forEach(item => void item.refetch()),
    };
}

function artifactDetail(artifact: ArtifactSummary) {
    const label = artifact.type === 'result_set' ? 'Result Set' : artifact.type === 'chart' ? 'Chart' : 'File';
    return `${label}${artifact.rowCount == null ? '' : ` · ${artifact.rowCount.toLocaleString()} rows`}`;
}
