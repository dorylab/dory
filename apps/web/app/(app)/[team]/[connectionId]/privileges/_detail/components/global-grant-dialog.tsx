'use client';

import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { globalGrantSelectedPrivilegesAtom } from '../stores/dialog-atoms';

type GlobalGrantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allPrivileges: readonly string[];
    grantablePrivileges: readonly string[];
    onConfirm: (selectedPrivileges: string[]) => void;
    loading?: boolean;
    entityLabel?: string;
};

export function GlobalGrantDialog({
    open,
    onOpenChange,
    allPrivileges,
    grantablePrivileges,
    onConfirm,
    loading,
    entityLabel,
}: GlobalGrantDialogProps) {
    const t = useTranslations('Privileges');
    const [selectedPrivileges, setSelectedPrivileges] = useAtom(globalGrantSelectedPrivilegesAtom);
    const visiblePrivileges = allPrivileges.filter(priv => grantablePrivileges.includes(priv));
    const resolvedEntityLabel = entityLabel ?? t('Labels.User');

    useEffect(() => {
        if (!open) {
            setSelectedPrivileges([]);
        }
    }, [open, setSelectedPrivileges]);

    const handleTogglePrivilege = (privilege: string) => {
        setSelectedPrivileges(prev => (prev.includes(privilege) ? prev.filter(item => item !== privilege) : [...prev, privilege]));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('GlobalGrantDialog.Title')}</DialogTitle>
                    <DialogDescription>{t('GlobalGrantDialog.Description', { entity: resolvedEntityLabel })}</DialogDescription>
                </DialogHeader>
                {visiblePrivileges.length ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                        {visiblePrivileges.map(privilege => {
                            const selected = selectedPrivileges.includes(privilege);
                            return (
                                <Button
                                    key={privilege}
                                    type="button"
                                    variant={selected ? 'default' : 'outline'}
                                    onClick={() => handleTogglePrivilege(privilege)}
                                    disabled={loading}
                                    className="justify-center"
                                >
                                    {privilege}
                                </Button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('GlobalGrantDialog.Empty')}</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {t('Actions.Cancel')}
                    </Button>
                    <Button onClick={() => onConfirm(selectedPrivileges)} disabled={!selectedPrivileges.length || loading}>
                        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {t('Actions.Confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
