'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Folder } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
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
    const [addToBusinessKnowledge, setAddToBusinessKnowledge] = useState(false);
    const [semanticModelId, setSemanticModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [businessMeaning, setBusinessMeaning] = useState('');
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
        setAddToBusinessKnowledge(false);
        setSemanticModelId('');
        setNewModelName('');
        setBusinessMeaning('');
        setError(null);
    }, [open, resolvedDefaultTitle]);

    const semanticModels = useQuery({
        queryKey: ['semantic-model-options', connectionId],
        enabled: open && addToBusinessKnowledge && Boolean(connectionId),
        queryFn: () => executeActionClient<{ models: Array<{ id: string; name: string }> }>('semantic.list', { connectionId }, { currentConnectionId: connectionId }),
    });

    useEffect(() => {
        if (!addToBusinessKnowledge) return;
        if (!semanticModelId && semanticModels.data?.models[0]) setSemanticModelId(semanticModels.data.models[0].id);
    }, [addToBusinessKnowledge, semanticModelId, semanticModels.data]);

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
        if (addToBusinessKnowledge && !businessMeaning.trim()) {
            setError(t('SaveSql.Errors.UseWhenRequired'));
            return;
        }
        if (addToBusinessKnowledge && !semanticModelId && !newModelName.trim()) {
            setError(t('SaveSql.Errors.DomainRequired'));
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
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('saved-queries-updated'));
            }
            await onSaved?.();

            if (addToBusinessKnowledge) {
                let targetModelId = semanticModelId;
                if (!targetModelId) {
                    const model = await executeActionClient<{ id: string }>('semantic.create', { name: newModelName.trim(), connectionIds: [connectionId] });
                    targetModelId = model.id;
                }
                await executeActionClient(
                    'semantic.createVerifiedQuery',
                    {
                        semanticModelId: targetModelId,
                        sourceConnectionId: connectionId,
                        title: title.trim(),
                        description: description.trim() ? description.trim() : undefined,
                        question: businessMeaning.trim(),
                        sql: sqlText,
                        sourceType: 'workspace',
                    },
                    { currentConnectionId: connectionId },
                );
            }

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
                        <div>
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="add-to-business-knowledge"
                                    checked={addToBusinessKnowledge}
                                    onCheckedChange={value => setAddToBusinessKnowledge(value === true)}
                                    disabled={saving}
                                />
                                <div className="grid gap-1">
                                    <label htmlFor="add-to-business-knowledge" className="text-sm font-medium">
                                        {t('SaveSql.AddToKnowledge')}
                                    </label>
                                    <p className="text-xs text-muted-foreground">{t('SaveSql.AddToKnowledgeDescription')}</p>
                                </div>
                            </div>
                            {addToBusinessKnowledge ? (
                                <div className="mt-3 grid gap-3 border-t pt-3">
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">{t('SaveSql.DomainLabel')}</label>
                                        {semanticModels.isLoading ? (
                                            <p className="text-sm text-muted-foreground">{t('SaveSql.LoadingDomains')}</p>
                                        ) : semanticModels.data?.models.length ? (
                                            <Select value={semanticModelId} onValueChange={setSemanticModelId} disabled={saving}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder={t('SaveSql.DomainPlaceholder')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {semanticModels.data.models.map(model => (
                                                        <SelectItem key={model.id} value={model.id}>
                                                            {model.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                value={newModelName}
                                                onChange={event => setNewModelName(event.target.value)}
                                                placeholder={t('SaveSql.NewDomainPlaceholder')}
                                                disabled={saving || semanticModels.isLoading}
                                            />
                                        )}
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">{t('SaveSql.UseWhenLabel')}</label>
                                        <Textarea
                                            value={businessMeaning}
                                            onChange={event => setBusinessMeaning(event.target.value)}
                                            placeholder={t('SaveSql.UseWhenPlaceholder')}
                                            rows={3}
                                            disabled={saving}
                                        />
                                    </div>
                                </div>
                            ) : null}
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
