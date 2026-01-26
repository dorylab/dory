'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';

type SaveSqlDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTitle?: string | null;
    getSqlText: () => string;
    onSaved?: () => void | Promise<void>;
};

export function SaveSqlDialog({ open, onOpenChange, defaultTitle, getSqlText, onSaved }: SaveSqlDialogProps) {
    const t = useTranslations('SqlConsole');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resolvedDefaultTitle = useMemo(() => {
        const raw = defaultTitle?.trim();
        return raw && raw.length > 0 ? raw : t('Tabs.NewQuery');
    }, [defaultTitle, t]);

    useEffect(() => {
        if (!open) return;
        setTitle(resolvedDefaultTitle);
        setDescription('');
        setError(null);
    }, [open, resolvedDefaultTitle]);

    const handleSave = async () => {
        if (saving) return;
        const sqlText = getSqlText().trim();
        if (!sqlText) {
            setError(t('SaveSql.Errors.SqlRequired'));
            return;
        }
        if (!title.trim()) {
            setError(t('SaveSql.Errors.TitleRequired'));
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const res = await authFetch('/api/sql-console/saved-queries', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() ? description.trim() : null,
                    sqlText,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok || (data && data.code !== 0)) {
                const message = data?.message ?? t('SaveSql.Errors.SaveFailed');
                setError(message);
                toast.error(message);
                return;
            }

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
        <Dialog open={open} onOpenChange={next => !saving && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('SaveSql.Title')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">{t('SaveSql.NameLabel')}</label>
                        <Input
                            value={title}
                            onChange={event => setTitle(event.target.value)}
                            placeholder={t('SaveSql.NamePlaceholder')}
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">{t('SaveSql.DescriptionLabel')}</label>
                        <Textarea
                            value={description}
                            onChange={event => setDescription(event.target.value)}
                            placeholder={t('SaveSql.DescriptionPlaceholder')}
                            rows={3}
                        />
                    </div>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button className='mr-2' variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('Actions.Cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? t('SaveSql.Saving') : t('Actions.Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
