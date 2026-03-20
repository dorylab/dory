'use client';

import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { globalRevokeSelectedPrivilegesAtom } from '../stores/dialog-atoms';

type GlobalRevokeDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    revocablePrivileges: readonly string[];
    onConfirm: (selectedPrivileges: string[]) => void;
    loading?: boolean;
};

export function GlobalRevokeDialog({
    open,
    onOpenChange,
    revocablePrivileges,
    onConfirm,
    loading,
}: GlobalRevokeDialogProps) {
    const t = useTranslations('Privileges');
    const [selectedPrivileges, setSelectedPrivileges] = useAtom(globalRevokeSelectedPrivilegesAtom);

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
                    <DialogTitle>{t('GlobalRevokeDialog.Title')}</DialogTitle>
                    <DialogDescription>{t('GlobalRevokeDialog.Description')}</DialogDescription>
                </DialogHeader>
                {revocablePrivileges.length ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                        {revocablePrivileges.map(privilege => {
                            const selected = selectedPrivileges.includes(privilege);
                            return (
                                <Button
                                    key={`revoke-${privilege}`}
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
                    <p className="text-sm text-muted-foreground">{t('GlobalRevokeDialog.Empty')}</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {t('Actions.Cancel')}
                    </Button>
                    <Button variant="destructive" onClick={() => onConfirm(selectedPrivileges)} disabled={!selectedPrivileges.length || loading}>
                        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {t('Actions.Revoke')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
