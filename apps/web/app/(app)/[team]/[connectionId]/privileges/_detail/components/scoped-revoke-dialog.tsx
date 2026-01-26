'use client';

import { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatPrivilegeLabelForScope } from '@/shared/privileges';
import {
    resetScopedRevokeDialogAtom,
    scopedRevokeContextAtom,
    scopedRevokeSelectedPrivilegesAtom,
    type ScopedRevokeContext,
} from '../stores/dialog-atoms';

type ScopedRevokeDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (context: ScopedRevokeContext, selectedPrivileges: string[]) => void;
    loading?: boolean;
};

export function ScopedRevokeDialog({ open, onOpenChange, onConfirm, loading }: ScopedRevokeDialogProps) {
    const t = useTranslations('Privileges');
    const [context] = useAtom(scopedRevokeContextAtom);
    const [selectedPrivileges, setSelectedPrivileges] = useAtom(scopedRevokeSelectedPrivilegesAtom);
    const resetDialog = useSetAtom(resetScopedRevokeDialogAtom);

    useEffect(() => {
        if (!open) {
            resetDialog();
        }
    }, [open, resetDialog]);

    useEffect(() => {
        if (context) {
            setSelectedPrivileges(context.privileges.slice());
        }
    }, [context, setSelectedPrivileges]);

    const handleTogglePrivilege = (privilege: string) => {
        setSelectedPrivileges(prev => (prev.includes(privilege) ? prev.filter(item => item !== privilege) : [...prev, privilege]));
    };

    const getPrivilegeLabel = (privilege: string) => {
        if (!context) return privilege;
        return formatPrivilegeLabelForScope(privilege, context.scope);
    };

    const handleConfirm = () => {
        if (!context) return;
        onConfirm(context, selectedPrivileges);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg space-y-6">
                <DialogHeader>
                    <DialogTitle>{t('ScopedRevokeDialog.Title')}</DialogTitle>
                    <DialogDescription>{t('ScopedRevokeDialog.Description')}</DialogDescription>
                </DialogHeader>
                {context ? (
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground">
                            {t('ScopedRevokeDialog.ObjectLabel')}
                            <span className="ml-1 font-medium text-foreground">
                                {context.scope === 'database'
                                    ? `${context.database}.*`
                                    : `${context.database}.${context.object ?? ''}`}
                            </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {context.privileges.map(privilege => {
                                const selected = selectedPrivileges.includes(privilege);
                                return (
                                    <Button
                                        key={`scoped-revoke-${privilege}`}
                                        type="button"
                                        variant={selected ? 'default' : 'outline'}
                                        onClick={() => handleTogglePrivilege(privilege)}
                                        disabled={loading}
                                        className="justify-center"
                                    >
                                        {getPrivilegeLabel(privilege)}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('ScopedRevokeDialog.Empty')}</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {t('Actions.Cancel')}
                    </Button>
                    <Button variant="destructive" onClick={handleConfirm} disabled={!context || !selectedPrivileges.length || loading}>
                        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {t('Actions.Revoke')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
