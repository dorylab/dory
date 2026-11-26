'use client';

import { newEntityId } from '@dory/shared/id';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Folder } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildSqlFallbackName, isDefaultSqlName } from '@dory/shared/utils/sql-name';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { QueryKnowledgeTarget, useQueryKnowledgeTarget } from '@/components/knowledge/query-knowledge-target';
import { SearchableSelect, type SelectOption } from '@/components/@dory/ui/searchable-select';
import { useAtomValue } from 'jotai';
import { refreshQueryLibraries } from '@/lib/knowledge-query-cache';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { useLocale, useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { AuthLinkSheet } from '@/components/auth/auth-link-sheet';
import { useRouteConnectionId } from '../../hooks/useRouteConnectionId';

type SaveSqlDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTitle?: string | null;
    getSqlText: () => string;
    onSaved?: () => void | Promise<void>;
};

export function SaveSqlDialog({ open, onOpenChange, defaultTitle, getSqlText, onSaved }: SaveSqlDialogProps) {
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const { data: session } = authClient.useSession();
    const routeConnectionId = useRouteConnectionId();
    const connectionId = routeConnectionId ?? currentConnection?.connection?.id ?? null;
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [folderId, setFolderId] = useState('');
    const [folderOptions, setFolderOptions] = useState<SelectOption[]>([]);
    const target = useQueryKnowledgeTarget(connectionId, open);
    const { enabled: addToBusinessKnowledge, setEnabled, setSelectedIds, setNewName } = target;
    const requestId = useRef('');
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authSheetOpen, setAuthSheetOpen] = useState(false);
    const descriptionEditedRef = useRef(false);
    const wasOpenRef = useRef(false);
    const isAnonymous = isAnonymousUser(session?.user);

    const resolvedDefaultTitle = useMemo(() => {
        const raw = defaultTitle?.trim();
        return raw && !isDefaultSqlName(raw) ? raw : '';
    }, [defaultTitle]);

    const folderEmptyText = useMemo(() => {
        return loadingFolders ? t('SaveSql.LoadingFolders') : t('SaveSql.FolderEmpty');
    }, [loadingFolders, t]);
    const callbackURL = useMemo(() => {
        const query = searchParams?.toString();
        return query ? `${pathname}?${query}` : pathname || '/';
    }, [pathname, searchParams]);
    const sqlTextForMetadata = useMemo(() => (open && addToBusinessKnowledge ? getSqlText().trim() : ''), [addToBusinessKnowledge, getSqlText, open]);

    useEffect(() => {
        const opening = open && !wasOpenRef.current;
        wasOpenRef.current = open;
        if (!opening) return;
        setTitle(resolvedDefaultTitle);
        setDescription('');
        setFolderId('');
        setEnabled(false);
        requestId.current = newEntityId();
        setSelectedIds([]);
        setNewName('');
        setError(null);
        descriptionEditedRef.current = false;
    }, [open, resolvedDefaultTitle, setEnabled, setSelectedIds, setNewName]);

    const savedQueryMetadata = useQuery({
        queryKey: ['saved-query-metadata', connectionId, resolvedDefaultTitle, sqlTextForMetadata, locale],
        enabled: open && addToBusinessKnowledge && !isAnonymous && Boolean(connectionId) && Boolean(sqlTextForMetadata),
        queryFn: async ({ signal }) => {
            const controller = new AbortController();
            const abort = () => controller.abort();
            const timeout = window.setTimeout(abort, 15_000);
            signal.addEventListener('abort', abort, { once: true });

            try {
                return await executeActionClient<{ description: string }>(
                    'ai.savedQueryMetadata',
                    {
                        connectionId,
                        title: resolvedDefaultTitle || buildSqlFallbackName(sqlTextForMetadata, locale),
                        sql: sqlTextForMetadata,
                        database: currentConnection?.connection?.database ?? null,
                    },
                    { currentConnectionId: connectionId, signal: controller.signal },
                );
            } finally {
                window.clearTimeout(timeout);
                signal.removeEventListener('abort', abort);
            }
        },
        retry: false,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (!open || !addToBusinessKnowledge || !savedQueryMetadata.data) return;
        if (!descriptionEditedRef.current) setDescription(savedQueryMetadata.data.description);
    }, [savedQueryMetadata.data, addToBusinessKnowledge, open]);

    useEffect(() => {
        if (!open || !connectionId || isAnonymous) {
            setFolderOptions([]);
            setLoadingFolders(false);
            return;
        }

        let cancelled = false;

        const loadFolders = async () => {
            setLoadingFolders(true);
            try {
                const data = await executeActionClient<Array<{ id: string; name: string }>>('savedQuery.listFolders', { connectionId }, { currentConnectionId: connectionId });

                if (cancelled) return;

                const nextOptions = Array.isArray(data)
                    ? data.map((folder: { id: string; name: string }) => ({
                          value: folder.id,
                          label: folder.name,
                      }))
                    : [];

                setFolderOptions(nextOptions);
            } catch (err) {
                if (cancelled) return;

                setFolderOptions([]);
                toast.error(err instanceof Error ? err.message : t('SaveSql.Errors.LoadFoldersFailed'));
            } finally {
                if (!cancelled) {
                    setLoadingFolders(false);
                }
            }
        };

        void loadFolders();

        return () => {
            cancelled = true;
        };
    }, [connectionId, isAnonymous, open, t]);

    const handleSave = async () => {
        if (saving) return;
        if (isAnonymous) {
            setAuthSheetOpen(true);
            return;
        }
        const sqlText = getSqlText().trim();
        if (!sqlText) {
            setError(t('SaveSql.Errors.SqlRequired'));
            return;
        }
        if (!connectionId) {
            const message = t('Tabs.MissingConnectionContext');
            setError(message);
            toast.error(message);
            return;
        }
        if (!target.ready) {
            setError(t('SaveSql.Errors.DomainRequired'));
            return;
        }

        setSaving(true);
        setError(null);

        try {
            if (addToBusinessKnowledge) {
                await executeActionClient(
                    'knowledge.saveQuery',
                    {
                        requestId: requestId.current,
                        collect: true,
                        folderId: folderId || null,
                        knowledgeModelIds: target.knowledgeModelIds.length ? target.knowledgeModelIds : undefined,
                        newModelName: target.newModelName,
                        sourceConnectionId: connectionId,
                        title: title.trim() || buildSqlFallbackName(sqlText, locale),
                        description: description.trim() || null,
                        sql: sqlText,
                        sourceType: 'workspace',
                    },
                    { currentConnectionId: connectionId },
                );
                await refreshQueryLibraries(queryClient);
            } else {
                await executeActionClient(
                    'savedQuery.create',
                    { id: requestId.current, connectionId, title: title.trim() || undefined, description: description.trim() || null, folderId: folderId || null, sqlText },
                    { currentConnectionId: connectionId },
                );
            }
            if (!addToBusinessKnowledge) window.dispatchEvent(new CustomEvent('saved-queries-updated'));
            await onSaved?.();
            toast.success(addToBusinessKnowledge ? t('SaveSql.SuccessWithKnowledge') : t('SaveSql.Success'));
            onOpenChange(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('SaveSql.Errors.SaveFailed');
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={next => !saving && onOpenChange(next)}>
                <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('SaveSql.Title')}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">{t('SaveSql.NameLabel')}</label>
                            <Input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('SaveSql.AutoNamePlaceholder')} />
                        </div>
                        <div className="grid gap-2">
                            <label htmlFor="save-sql-description" className="text-sm font-medium">
                                {t('SaveSql.DescriptionLabel')}
                            </label>
                            <Textarea
                                id="save-sql-description"
                                maxLength={4000}
                                value={description}
                                onChange={event => {
                                    descriptionEditedRef.current = true;
                                    setDescription(event.target.value);
                                }}
                                placeholder={savedQueryMetadata.isFetching ? t('SaveSql.GeneratingMetadata') : t('SaveSql.DescriptionPlaceholder')}
                                rows={3}
                                disabled={saving}
                            />
                            {addToBusinessKnowledge && savedQueryMetadata.isError && !descriptionEditedRef.current && (
                                <p className="text-xs text-muted-foreground">{t('SaveSql.MetadataGenerationFailed')}</p>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">{t('SaveSql.FolderLabel')}</label>
                            <div className={saving ? 'pointer-events-none opacity-70' : undefined}>
                                <SearchableSelect
                                    value={folderId}
                                    options={folderOptions}
                                    onChange={setFolderId}
                                    icon={Folder}
                                    enableAll
                                    allLabel={t('SaveSql.RootFolderLabel')}
                                    allValue=""
                                    placeholder={t('SaveSql.FolderPlaceholder')}
                                    emptyText={folderEmptyText}
                                    groupLabel={t('SaveSql.FolderGroupLabel')}
                                    popoverClassName="w-[var(--radix-popover-trigger-width)]"
                                    triggerSize="default"
                                />
                            </div>
                        </div>
                        <QueryKnowledgeTarget target={target} disabled={saving} />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button className="mr-2" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                            {t('Actions.Cancel')}
                        </Button>
                        <Button onClick={handleSave} disabled={saving || !target.ready}>
                            {saving ? t('SaveSql.Saving') : t('Actions.Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AuthLinkSheet open={authSheetOpen} onOpenChange={setAuthSheetOpen} callbackURL={callbackURL} />
        </>
    );
}
