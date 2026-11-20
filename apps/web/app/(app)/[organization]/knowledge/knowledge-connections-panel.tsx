'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { DriveFolderDialog, LocalFolderDialog } from './folder-connector-dialogs';
import { ExtractionConnectorStatus } from './knowledge-extraction-panel';
import { GitHubConnectorDialog, SourceViewer, type KnowledgeSourceSummary } from './knowledge-sources-panel';
import { LinearConnectorDialog, type KnowledgeConnectorView } from './linear-connector-dialog';
import { providers, type Provider } from './document-directory';
import { SourceLogo } from './source-logo';
import { saveDirectoryHandle } from './local-folder';

const brands = { github: 'GitHub', linear: 'Linear', drive: 'Google Drive' };
const parsers = {
    source: parseAsString,
    tab: parseAsString,
    file: parseAsString,
    folder: parseAsString,
    githubInstallationId: parseAsString,
    githubConnectionState: parseAsString,
};
function connectionName(item: KnowledgeConnectorView) {
    if (item.provider === 'github') return item.repositoryFullName;
    if (item.provider === 'linear') return item.linearWorkspaceName;
    return item.displayName;
}

export function KnowledgeSourcesPanel({
    organization,
    knowledgeModelId,
    action,
    onDone,
    onView,
}: {
    organization: string;
    knowledgeModelId: string;
    action?: { provider?: Provider; connectorId?: string };
    onDone?: () => void;
    onView?: (connectorId: string) => void;
}) {
    const t = useTranslations('Knowledge.Connections');
    const sources = useTranslations('Knowledge.KnowledgeSources');
    const client = useQueryClient();
    const [url, setUrl] = useQueryStates(parsers);
    const [setup, setSetup] = useState<Provider | null>(action?.provider ?? null);
    const [editing, setEditing] = useState<KnowledgeConnectorView>();
    const [removing, setRemoving] = useState<KnowledgeConnectorView>();
    const options = { organizationId: organization };
    const prefix = ['knowledge-model', knowledgeModelId];
    const connections = useQuery({
        queryKey: [...prefix, 'knowledge-connectors'],
        queryFn: () =>
            executeActionClient<{ connectors: KnowledgeConnectorView[]; canWrite: boolean; canManageLinear: boolean }>('knowledge.listConnectors', { knowledgeModelId }, options),
        refetchInterval: q => (q.state.data?.connectors.some(c => ['pending', 'syncing'].includes(c.status)) ? 2000 : 15000),
    });
    const writable = (provider: Provider) => Boolean(connections.data?.canWrite && (provider !== 'linear' || connections.data.canManageLinear));
    const legacy = useQuery({
        queryKey: [...prefix, 'source-link', url.source],
        queryFn: () => executeActionClient<KnowledgeSourceSummary>('knowledge.getKnowledgeSource', { knowledgeModelId, id: url.source }, options),
        enabled: Boolean(url.source),
        retry: false,
    });
    useEffect(() => {
        if (url.source && legacy.data?.id === url.source && legacy.data.format === 'markdown')
            void setUrl({ source: null, tab: 'documents', file: url.source, folder: null }, { history: 'replace' });
    }, [url.source, legacy.data, setUrl]);
    const returned = Boolean(url.githubInstallationId && url.githubConnectionState);
    const closeSetup = () => {
        setSetup(null);
        setEditing(undefined);
        if (action?.provider) onDone?.();
        if (returned) void setUrl({ githubInstallationId: null, githubConnectionState: null });
    };
    const refresh = () => client.invalidateQueries({ queryKey: prefix });
    const connected = () => {
        closeSetup();
        void refresh();
    };
    const sync = useMutation({
        mutationFn: (connectorId: string) => executeActionClient('knowledge.syncConnector', { connectorId }, options),
        onSuccess: () => {
            void refresh();
            toast.success(sources('ConnectorSyncQueued'));
        },
        onError: e => toast.error(e.message),
    });
    const disconnect = useMutation({
        mutationFn: (id: string) => executeActionClient('knowledge.deleteConnector', { connectorId: id }, { ...options, confirmationToken: 'knowledge.deleteConnector' }),
        onSuccess: (_, id) => {
            if (removing?.provider === 'local') void saveDirectoryHandle(id).catch(() => undefined);
            setRemoving(undefined);
            onDone?.();
            void refresh();
        },
        onError: e => toast.error(e.message),
    });
    const label = (provider: Provider) => (provider === 'local' ? t('Local') : brands[provider]);
    const rows = (connections.data?.connectors ?? [])
        .filter(c => !action?.connectorId || c.id === action.connectorId)
        .sort((a, b) => providers.indexOf(a.provider) - providers.indexOf(b.provider) || connectionName(a).localeCompare(connectionName(b)) || a.id.localeCompare(b.id));
    const dialogProps = { organization, knowledgeModelId, onClose: closeSetup };
    const management = (
        <section hidden={!rows.length} className="mt-8 space-y-3" aria-label={t('Existing')}>
            <h2 className="text-base font-semibold">{t('Existing')}</h2>
            <ul className="divide-y rounded-xl border bg-card">
                {rows.map(c => (
                    <li key={c.id} className="grid min-w-0 gap-x-5 gap-y-2 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <SourceLogo provider={c.provider} className="size-5 shrink-0" />
                                <h3 className="min-w-0 break-all font-medium">
                                    {c.provider === 'drive' ? (
                                        <a
                                            href={`https://drive.google.com/drive/folders/${encodeURIComponent(c.driveFolderId)}`}
                                            className="hover:underline"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {c.displayName}
                                        </a>
                                    ) : (
                                        connectionName(c)
                                    )}
                                </h3>
                                <Badge variant="outline">{sources(`GitHubStatus.${c.status}`)}</Badge>
                            </div>
                            <p className="break-words text-sm text-muted-foreground">
                                {c.provider === 'github'
                                    ? c.defaultBranch + ' · ' + (c.rootPath || sources('GitHubRepositoryRoot'))
                                    : c.provider === 'linear'
                                      ? sources('LinearProjectCount', { count: c.projectIds.length })
                                      : c.provider === 'local'
                                        ? t('LocalScope')
                                        : t('DriveScope')}
                            </p>
                            {c.provider === 'linear' && c.projectNames?.length ? <p className="break-words text-sm">{c.projectNames.join(' · ')}</p> : null}
                            <p className="text-xs text-muted-foreground">
                                {c.lastSyncedAt ? sources('GitHubLastSynced', { date: new Date(c.lastSyncedAt).toLocaleString() }) : sources('GitHubNotSynced')}
                            </p>
                            {c.lastError && <p className="text-sm text-destructive">{c.lastError}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                            <Button size="sm" variant="outline" asChild>
                                <Link
                                    onClick={event => {
                                        if (onView) {
                                            event.preventDefault();
                                            onView(c.id);
                                        }
                                    }}
                                    href={`?tab=documents&folder=${encodeURIComponent(c.id)}`}
                                >
                                    {t('ViewDocuments')}
                                </Link>
                            </Button>
                            {writable(c.provider) && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={sync.isPending || c.status === 'disabled' || c.status === 'syncing'}
                                        onClick={() => {
                                            if (c.provider === 'local') {
                                                setEditing(c);
                                                setSetup('local');
                                            } else sync.mutate(c.id);
                                        }}
                                    >
                                        {sources('GitHubSyncNow')}
                                    </Button>
                                    {c.provider === 'drive' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setEditing(c);
                                                setSetup('drive');
                                            }}
                                        >
                                            {t('Authorize')}
                                        </Button>
                                    )}
                                    {c.provider === 'linear' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setEditing(c);
                                                setSetup('linear');
                                            }}
                                        >
                                            {sources(c.status === 'disabled' ? 'LinearUpdateApiKey' : 'LinearEditProjects')}
                                        </Button>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => setRemoving(c)}>
                                        {sources('GitHubDisconnect')}
                                    </Button>
                                </>
                            )}
                        </div>
                        {(c.provider === 'github' || c.provider === 'linear') && writable(c.provider) && (
                            <div className="md:col-span-2">
                                <ExtractionConnectorStatus organization={organization} knowledgeModelId={knowledgeModelId} connectorId={c.id} />
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
    const disconnectPrompt = removing && (
        <>
            <DialogHeader>
                <DialogTitle>{sources('ConnectorDisconnectTitle')}</DialogTitle>
                <DialogDescription>{sources('ConnectorDisconnectDescription', { name: connectionName(removing) })}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRemoving(undefined)}>
                    {sources('Cancel')}
                </Button>
                <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate(removing.id)}>
                    {sources('GitHubDisconnect')}
                </Button>
            </div>
        </>
    );
    return (
        <>
            {!action && (
                <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                    {providers.map(provider => {
                        const count = rows.filter(c => c.provider === provider).length;
                        return (
                            <button
                                key={provider}
                                type="button"
                                disabled={!writable(provider)}
                                onClick={() => setSetup(provider)}
                                className="group flex aspect-square min-w-0 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-xs transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-65"
                            >
                                <SourceLogo provider={provider} className="size-9 sm:size-11" />
                                <span className="text-center">
                                    <span className="block font-medium">{label(provider)}</span>
                                    <span className="mt-1 block text-xs text-muted-foreground">{connections.data ? t('Count', { count }) : '…'}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            {(connections.error || (url.source && legacy.error)) && (
                <p role="alert" className="text-sm text-destructive">
                    {(connections.error ?? legacy.error)?.message}
                </p>
            )}
            {url.source && legacy.data && legacy.data.format !== 'markdown' && (
                <SourceViewer source={legacy.data} organization={organization} knowledgeModelId={knowledgeModelId} onClose={() => void setUrl({ source: null })} />
            )}
            {!action && management}
            {!setup && (action?.connectorId || removing) && (
                <Dialog
                    open
                    onOpenChange={open => {
                        if (open) return;
                        if (removing) setRemoving(undefined);
                        else onDone?.();
                    }}
                >
                    <DialogContent className="max-h-[85vh] overflow-auto">
                        {disconnectPrompt ?? (
                            <>
                                <DialogHeader>
                                    <DialogTitle>{rows[0] ? connectionName(rows[0]) : t('Existing')}</DialogTitle>
                                </DialogHeader>
                                {connections.isError && <p role="alert">{connections.error.message}</p>}
                                {management}
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            )}
            {(setup === 'github' || returned) && (
                <GitHubConnectorDialog
                    open
                    organization={organization}
                    knowledgeModelId={knowledgeModelId}
                    installationId={url.githubInstallationId ?? ''}
                    connectionState={url.githubConnectionState ?? ''}
                    onConnected={connected}
                    onOpenChange={open => !open && closeSetup()}
                />
            )}
            {setup === 'linear' && <LinearConnectorDialog {...dialogProps} connector={editing?.provider === 'linear' ? editing : undefined} onClose={connected} />}
            {setup === 'drive' && <DriveFolderDialog {...dialogProps} connector={editing?.provider === 'drive' ? editing : undefined} onConnected={connected} />}
            {setup === 'local' && <LocalFolderDialog {...dialogProps} connector={editing?.provider === 'local' ? editing : undefined} onConnected={connected} />}
        </>
    );
}
