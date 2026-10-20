'use client';

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { LinearLogo } from './linear-logo';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

export type KnowledgeConnectorView = {
    id: string;
    status: 'pending' | 'syncing' | 'ready' | 'error' | 'disabled';
    lastSyncedAt: string | null;
    lastError: string | null;
} & (
    | { provider: 'github'; repositoryFullName: string; defaultBranch: string; rootPath: string }
    | {
          provider: 'linear';
          credentialId: string | null;
          linearWorkspaceId: string;
          linearWorkspaceName: string;
          projectIds: string[];
      }
);

type LinearSetup = {
    available: boolean;
    configured: boolean;
    canManage: boolean;
    credentials: Array<{ id: string; workspaceId: string; workspaceName: string; status: 'active' | 'invalid'; version: number }>;
};
type ProjectPage = { nodes: Array<{ id: string; name: string; url: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
export const linearSetupKey = (organization: string, knowledgeModelId: string) => ['linear-connector-setup', organization, knowledgeModelId] as const;
export const fetchLinearSetup = (organization: string, knowledgeModelId: string) =>
    executeActionClient<LinearSetup>('knowledge.getLinearConnectorSetup', { knowledgeModelId }, { organizationId: organization });

export function LinearConnectorDialog({
    organization,
    knowledgeModelId,
    connector,
    onClose,
}: {
    organization: string;
    knowledgeModelId: string;
    connector?: Extract<KnowledgeConnectorView, { provider: 'linear' }>;
    onClose: () => void;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const queryClient = useQueryClient();
    const [chosenCredential, setChosenCredential] = useState<string | undefined>(connector?.credentialId ?? undefined);
    const [apiKey, setApiKey] = useState('');
    const [selected, setSelected] = useState<string[]>(connector?.projectIds ?? []);
    const [confirmed, setConfirmed] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [search, setSearch] = useState('');
    const setup = useQuery({ queryKey: linearSetupKey(organization, knowledgeModelId), queryFn: () => fetchLinearSetup(organization, knowledgeModelId) });
    const credentialId =
        chosenCredential ?? (connector ? setup.data?.credentials.find(item => item.workspaceId === connector.linearWorkspaceId)?.id : setup.data?.credentials[0]?.id) ?? '__new__';
    const credential = setup.data?.credentials.find(item => item.id === credentialId);
    const projects = useInfiniteQuery({
        queryKey: ['linear-projects', organization, knowledgeModelId, credentialId, credential?.version, search],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) =>
            executeActionClient<ProjectPage>('knowledge.listLinearProjects', { knowledgeModelId, credentialId, search, after: pageParam }, { organizationId: organization }),
        getNextPageParam: page => (page.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? undefined) : undefined),
        enabled: Boolean(setup.data?.configured && setup.data.canManage && credential?.status === 'active'),
    });
    const saveKey = useMutation({
        // Keep the key out of React Query mutation variables and query cache keys.
        mutationFn: () =>
            executeActionClient<LinearSetup['credentials'][number]>(
                'knowledge.saveLinearApiKey',
                { knowledgeModelId, apiKey, credentialId: credential?.id, connectorId: connector?.id },
                { organizationId: organization },
            ),
        onSuccess: async result => {
            setApiKey('');
            if (connector && result.workspaceId !== connector.linearWorkspaceId) return;
            setChosenCredential(result.id);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: linearSetupKey(organization, knowledgeModelId) }),
                queryClient.invalidateQueries({ queryKey: ['linear-projects', organization, knowledgeModelId] }),
                queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId, 'knowledge-connectors'] }),
            ]);
            toast.success(t('LinearKeySaved'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('LinearFailed')),
    });
    const close = () => {
        setApiKey('');
        onClose();
    };
    const save = useMutation({
        mutationFn: () =>
            executeActionClient(
                connector ? 'knowledge.updateLinearProjects' : 'knowledge.createLinearConnector',
                connector ? { connectorId: connector.id, projectIds: selected } : { knowledgeModelId, credentialId, projectIds: selected },
                { organizationId: organization },
            ),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId, 'knowledge-connectors'] }),
                queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId, 'knowledge-sources'] }),
            ]);
            toast.success(t('ConnectorSyncQueued'));
            close();
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('LinearFailed')),
    });
    const allProjects = projects.data?.pages.flatMap(page => page.nodes) ?? [];
    const toggle = (id: string) => {
        setSelected(previous => (previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]));
        setConfirmed(false);
    };
    return (
        <Dialog open onOpenChange={open => !open && close()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LinearLogo className="size-5" /> {t('LinearTitle')}
                    </DialogTitle>
                    <DialogDescription>{t('LinearDescription')}</DialogDescription>
                </DialogHeader>
                {setup.isLoading ? <p role="status">{t('Loading')}</p> : null}
                {setup.error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {setup.error.message}
                    </p>
                ) : null}
                {setup.data && !setup.data.configured ? <p className="text-sm text-muted-foreground">{t('LinearNotConfigured')}</p> : null}
                {setup.data && !setup.data.canManage ? <p className="text-sm text-muted-foreground">{t('LinearAdminOnly')}</p> : null}
                {setup.data?.configured && setup.data.canManage ? (
                    <div className="space-y-4">
                        {!connector && setup.data.credentials.length ? (
                            <Select
                                value={credentialId}
                                onValueChange={id => {
                                    setChosenCredential(id);
                                    setSelected([]);
                                    setConfirmed(false);
                                    setApiKey('');
                                }}
                            >
                                <SelectTrigger aria-label={t('LinearWorkspace')} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__new__">{t('LinearAnotherWorkspace')}</SelectItem>
                                    {setup.data.credentials.map(item => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.workspaceName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : connector ? (
                            <p className="font-medium">{connector.linearWorkspaceName}</p>
                        ) : null}
                        <form
                            className="space-y-2"
                            onSubmit={event => {
                                event.preventDefault();
                                saveKey.mutate();
                            }}
                        >
                            <label htmlFor="linear-api-key" className="text-sm font-medium">
                                {t('LinearApiKey')}
                            </label>
                            <Input
                                id="linear-api-key"
                                type="password"
                                autoComplete="off"
                                spellCheck={false}
                                value={apiKey}
                                maxLength={4096}
                                onChange={event => setApiKey(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">{t('LinearSharedKeyNotice')}</p>
                            <Button type="submit" variant="outline" disabled={!apiKey.trim() || saveKey.isPending}>
                                {t(saveKey.isPending ? 'LinearSaving' : credential || connector ? 'LinearUpdateApiKey' : 'LinearVerifyKey')}
                            </Button>
                            {saveKey.error ? (
                                <p role="alert" className="text-sm text-destructive">
                                    {saveKey.error.message}
                                </p>
                            ) : null}
                        </form>
                        {credential?.status === 'invalid' ? (
                            <p role="alert" className="text-sm text-destructive">
                                {t('LinearNeedsApiKey')}
                            </p>
                        ) : null}
                        {credential?.status === 'active' ? (
                            <>
                                <form
                                    className="flex gap-2"
                                    onSubmit={event => {
                                        event.preventDefault();
                                        setSearch(searchText.trim());
                                    }}
                                >
                                    <Input
                                        aria-label={t('LinearSearchProjects')}
                                        placeholder={t('LinearSearchProjects')}
                                        value={searchText}
                                        maxLength={160}
                                        onChange={event => setSearchText(event.target.value)}
                                    />
                                    <Button type="submit" variant="outline">
                                        {t('LinearSearch')}
                                    </Button>
                                </form>
                                <p className="text-xs text-muted-foreground">{t('LinearProjectCount', { count: selected.length })}</p>
                                {selected.length ? (
                                    <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                                        {selected.map(id => (
                                            <Button key={id} size="sm" variant="secondary" onClick={() => toggle(id)}>
                                                {allProjects.find(project => project.id === id)?.name ?? id} ×
                                            </Button>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">
                                    {projects.isLoading ? (
                                        <p role="status" className="text-sm text-muted-foreground">
                                            {t('Loading')}
                                        </p>
                                    ) : null}
                                    {projects.error ? (
                                        <p role="alert" className="text-sm text-destructive">
                                            {projects.error.message}
                                        </p>
                                    ) : null}
                                    {!projects.isLoading && !projects.error && !allProjects.length ? (
                                        <p className="text-sm text-muted-foreground">{t('LinearNoProjects')}</p>
                                    ) : null}
                                    {allProjects.map(project => (
                                        <label key={project.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                                            <Checkbox
                                                checked={selected.includes(project.id)}
                                                disabled={!selected.includes(project.id) && selected.length >= 100}
                                                onCheckedChange={() => toggle(project.id)}
                                            />
                                            <span className="text-sm">{project.name}</span>
                                        </label>
                                    ))}
                                    {projects.hasNextPage ? (
                                        <Button variant="ghost" onClick={() => void projects.fetchNextPage()} disabled={projects.isFetchingNextPage}>
                                            {t('LinearLoadMore')}
                                        </Button>
                                    ) : null}
                                </div>
                                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-4 py-3">
                                    <Checkbox className="mt-0.5" checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} />
                                    <span className="text-sm leading-5 text-muted-foreground">{t('LinearSharingNotice')}</span>
                                </label>
                            </>
                        ) : null}
                    </div>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={close}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        disabled={!setup.data?.configured || !setup.data.canManage || !selected.length || !confirmed || save.isPending || credential?.status !== 'active'}
                        onClick={() => save.mutate()}
                    >
                        {t(save.isPending ? 'LinearSaving' : connector ? 'LinearSaveProjects' : 'LinearConnectAndSync')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
