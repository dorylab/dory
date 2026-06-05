'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Folder } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { SearchableSelect, type SelectOption } from '@/components/@dory/ui/searchable-select';
import { useAtomValue } from 'jotai';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { useTranslations } from 'next-intl';
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
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authSheetOpen, setAuthSheetOpen] = useState(false);
    const isAnonymous = isAnonymousUser(session?.user);

    const resolvedDefaultTitle = useMemo(() => {
        const raw = defaultTitle?.trim();
        return raw && raw.length > 0 ? raw : t('Tabs.NewQuery');
    }, [defaultTitle, t]);

    const folderEmptyText = useMemo(() => {
        return loadingFolders ? t('SaveSql.LoadingFolders') : t('SaveSql.FolderEmpty');
    }, [loadingFolders, t]);
    const callbackURL = useMemo(() => {
        const query = searchParams?.toString();
        return query ? `${pathname}?${query}` : pathname || '/';
    }, [pathname, searchParams]);

    useEffect(() => {
        if (!open) return;
        setTitle(resolvedDefaultTitle);
        setDescription('');
        setFolderId('');
        setError(null);
    }, [open, resolvedDefaultTitle]);

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
                const data = await executeActionClient<Array<{ id: string; name: string }>>(
                    'savedQuery.listFolders',
                    { connectionId },
                    { currentConnectionId: connectionId },
                );

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
        if (!title.trim()) {
            setError(t('SaveSql.Errors.TitleRequired'));
            return;
        }
        if (!connectionId) {
            const message = t('Tabs.MissingConnectionContext');
            setError(message);
            toast.error(message);
            return;
        }

        setSaving(true);
        setError(null);

        try {
            await executeActionClient(
                'savedQuery.create',
                {
                    connectionId,
                    title: title.trim(),
                    description: description.trim() ? description.trim() : null,
                    folderId: folderId || null,
                    sqlText,
                },
                { currentConnectionId: connectionId },
            );

            toast.success(t('SaveSql.Success'));
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('saved-queries-updated'));
            }
            await onSaved?.();
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
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('SaveSql.Title')}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">{t('SaveSql.NameLabel')}</label>
                            <Input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('SaveSql.NamePlaceholder')} />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">{t('SaveSql.DescriptionLabel')}</label>
                            <Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t('SaveSql.DescriptionPlaceholder')} rows={3} />
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
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button className="mr-2" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                            {t('Actions.Cancel')}
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? t('SaveSql.Saving') : t('Actions.Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AuthLinkSheet open={authSheetOpen} onOpenChange={setAuthSheetOpen} callbackURL={callbackURL} />
        </>
    );
}
