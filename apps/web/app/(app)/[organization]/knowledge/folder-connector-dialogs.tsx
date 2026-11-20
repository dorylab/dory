'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { hasDirectoryPicker, readDirectory, readDirectoryInput, rememberedDirectory, saveDirectoryHandle, type FolderSelection } from './local-folder';
import type { KnowledgeConnectorView } from './linear-connector-dialog';

type Props = { organization: string; knowledgeModelId: string; onClose: () => void; onConnected: () => void };

export function LocalFolderDialog({
    organization,
    knowledgeModelId,
    connector,
    onClose,
    onConnected,
}: Props & { connector?: Extract<KnowledgeConnectorView, { provider: 'local' }> }) {
    const t = useTranslations('Knowledge.Connections');
    const input = useRef<HTMLInputElement>(null);
    const saved = useQuery({
        queryKey: ['local-directory-permission', organization, knowledgeModelId, connector?.id],
        queryFn: async () => (await rememberedDirectory(connector!.id)) ?? null,
        enabled: Boolean(connector),
        refetchOnMount: 'always',
        gcTime: 0,
    });
    const sync = useMutation({
        mutationFn: async (selection: Promise<FolderSelection>) => {
            const data = await selection;
            if (connector && data.name !== connector.displayName) throw new Error(t('WrongFolder', { name: connector.displayName }));
            const { id } = await executeActionClient<{ id: string }>(
                'knowledge.syncLocalFolder',
                {
                    knowledgeModelId,
                    connectorId: connector?.id,
                    revision: connector?.configRevision,
                    name: data.name,
                    files: data.files,
                    directories: data.directories,
                },
                { organizationId: organization },
            );
            if (data.handle) await saveDirectoryHandle(id, data.handle).catch(() => toast.info(t('Reselect')));
        },
        onSuccess: onConnected,
        onError: error => {
            if (connector && ['NotAllowedError', 'NotFoundError'].includes(error.name)) void saved.refetch();
        },
    });
    return (
        <Dialog open onOpenChange={v => !v && !sync.isPending && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{connector?.displayName ?? t('Local')}</DialogTitle>
                    <DialogDescription>{connector && !saved.data ? t('Reselect') : t('LocalScope')}</DialogDescription>
                </DialogHeader>
                <input
                    type="file"
                    ref={input}
                    {...{ webkitdirectory: '' }}
                    multiple
                    hidden
                    onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (files.length) sync.mutate(readDirectoryInput(files));
                    }}
                />
                {sync.error && sync.error.name !== 'AbortError' && (
                    <p role="alert" className="text-sm text-destructive">
                        {sync.error.message}
                    </p>
                )}
                <Button
                    disabled={sync.isPending || Boolean(connector && saved.isLoading)}
                    onClick={() => (hasDirectoryPicker() ? sync.mutate(readDirectory(saved.data ?? undefined)) : input.current?.click())}
                >
                    {sync.isPending ? t('Syncing') : saved.data ? t('Sync') : t('ChooseFolder')}
                </Button>
                {saved.data && (
                    <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(readDirectory())}>
                        {t('ChooseFolder')}
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function DriveFolderDialog({
    organization,
    knowledgeModelId,
    onClose,
    onConnected,
    connector,
}: Props & { connector?: Extract<KnowledgeConnectorView, { provider: 'drive' }> }) {
    const t = useTranslations('Knowledge.Connections');
    const [trail, setTrail] = useState([connector ? { id: connector.driveFolderId, name: connector.displayName } : { id: 'root', name: t('MyDrive') }]);
    const current = trail[trail.length - 1];
    const options = { organizationId: organization };
    const begin = useMutation({ mutationFn: () => executeActionClient<{ id: string; url: string }>('knowledge.beginDriveAuthorization', { knowledgeModelId }, options) });
    const id = begin.data?.id;
    const status = useQuery({
        queryKey: ['drive-authorization', organization, knowledgeModelId, id],
        enabled: Boolean(id),
        queryFn: () => executeActionClient<{ status: 'ready' | 'pending' | 'cancelled' }>('knowledge.driveAuthorizationStatus', { knowledgeModelId, id }, options),
        refetchInterval: q => (q.state.status !== 'error' && q.state.data?.status !== 'ready' && q.state.data?.status !== 'cancelled' ? 2000 : false),
        retry: false,
    });
    const folders = useQuery({
        queryKey: ['drive-folders', id, current.id],
        enabled: !connector && status.data?.status === 'ready',
        queryFn: () => executeActionClient<{ folders: { id: string; name: string }[] }>('knowledge.listDriveFolders', { knowledgeModelId, id, folderId: current.id }, options),
    });
    const connect = useMutation({
        mutationFn: () => executeActionClient('knowledge.connectDriveFolder', { knowledgeModelId, id, folderId: current.id, connectorId: connector?.id }, options),
        onSuccess: onConnected,
    });
    const error = begin.error ?? status.error ?? folders.error ?? connect.error;
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Google Drive</DialogTitle>
                    <DialogDescription>{t('DriveScope')}</DialogDescription>
                </DialogHeader>
                {status.data?.status === 'ready' ? (
                    <>
                        <nav className="flex flex-wrap items-center gap-1 text-sm">
                            {trail.map((item, i) => (
                                <Button key={item.id} variant="ghost" size="sm" onClick={() => setTrail(trail.slice(0, i + 1))}>
                                    {item.name}
                                </Button>
                            ))}
                        </nav>
                        <div className="max-h-64 overflow-y-auto">
                            {folders.data?.folders.map(item => (
                                <Button key={item.id} variant="ghost" className="w-full justify-start" onClick={() => setTrail([...trail, item])}>
                                    <Folder />
                                    {item.name}
                                    <ChevronRight className="ml-auto" />
                                </Button>
                            ))}
                        </div>
                        <Button disabled={(!connector && !folders.data) || connect.isPending} onClick={() => connect.mutate()}>
                            {t('ConnectFolder', { name: current.name })}
                        </Button>
                    </>
                ) : begin.data && !status.isError && status.data?.status !== 'cancelled' ? (
                    <Button asChild>
                        <a href={begin.data.url} target="_blank" rel="noopener noreferrer">
                            {t('Authorize')}
                        </a>
                    </Button>
                ) : (
                    <Button disabled={begin.isPending} onClick={() => begin.mutate()}>
                        {t('ConnectGoogle')}
                    </Button>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error.message}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
