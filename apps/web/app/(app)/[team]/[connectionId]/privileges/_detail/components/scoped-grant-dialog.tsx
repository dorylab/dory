'use client';

import { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
    resetScopedGrantDialogAtom,
    scopedGrantDatabaseAtom,
    scopedGrantObjectAtom,
    scopedGrantScopeAtom,
    scopedGrantSelectedPrivilegesAtom,
} from '../stores/dialog-atoms';

import type { SelectOption } from '../types';

type ScopedGrantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    databaseOptions: SelectOption[];
    tableOptions: SelectOption[];
    viewOptions: SelectOption[];
    privilegeOptions: readonly string[];
    onConfirm: () => void;
    loading?: boolean;
};

export function ScopedGrantDialog({
    open,
    onOpenChange,
    databaseOptions,
    tableOptions,
    viewOptions,
    privilegeOptions,
    onConfirm,
    loading,
}: ScopedGrantDialogProps) {
    const t = useTranslations('Privileges');
    const [scope, setScope] = useAtom(scopedGrantScopeAtom);
    const [database, setDatabase] = useAtom(scopedGrantDatabaseAtom);
    const [objectValue, setObjectValue] = useAtom(scopedGrantObjectAtom);
    const [selectedPrivileges, setSelectedPrivileges] = useAtom(scopedGrantSelectedPrivilegesAtom);
    const resetDialog = useSetAtom(resetScopedGrantDialogAtom);

    useEffect(() => {
        if (!open) {
            resetDialog();
        }
    }, [open, resetDialog]);

    const handleScopeChange = (value: string) => {
        const nextScope = value as 'database' | 'table' | 'view';
        setScope(nextScope);
        setSelectedPrivileges([]);
        if (nextScope === 'database') {
            setObjectValue('');
        }
    };

    const handleDatabaseChange = (value: string) => {
        setDatabase(value);
        setSelectedPrivileges([]);
        setObjectValue('');
    };

    const handleObjectChange = (value: string) => {
        setObjectValue(value);
    };

    const handleTogglePrivilege = (privilege: string) => {
        setSelectedPrivileges(prev => (prev.includes(privilege) ? prev.filter(item => item !== privilege) : [...prev, privilege]));
    };

    const objectPlaceholder = scope === 'table' ? t('ScopedGrantDialog.ObjectPlaceholderTable') : t('ScopedGrantDialog.ObjectPlaceholderView');
    const objectOptions = scope === 'table' ? tableOptions : viewOptions;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl space-y-6">
                <DialogHeader>
                    <DialogTitle>{t('ScopedGrantDialog.Title')}</DialogTitle>
                    <DialogDescription>{t('ScopedGrantDialog.Description')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Tabs value={scope} onValueChange={handleScopeChange}>
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="database">{t('ScopedGrantDialog.Tabs.Database')}</TabsTrigger>
                            <TabsTrigger value="table">{t('ScopedGrantDialog.Tabs.Table')}</TabsTrigger>
                            <TabsTrigger value="view">{t('ScopedGrantDialog.Tabs.View')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">{t('ScopedGrantDialog.DatabaseLabel')}</p>
                            <Select
                                value={database}
                                onValueChange={handleDatabaseChange}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t('ScopedGrantDialog.DatabasePlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {databaseOptions.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {scope !== 'database' ? (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">
                                    {scope === 'table' ? t('ScopedGrantDialog.TableLabel') : t('ScopedGrantDialog.ViewLabel')}
                                </p>
                                <Select value={objectValue} onValueChange={handleObjectChange} disabled={!database}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={objectPlaceholder} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {objectOptions.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">{t('ScopedGrantDialog.PrivilegesLabel')}</p>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {privilegeOptions.map(privilege => {
                                const selected = selectedPrivileges.includes(privilege);
                                return (
                                    <Button
                                        key={`scoped-grant-${privilege}`}
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
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {t('Actions.Cancel')}
                    </Button>
                    <Button onClick={onConfirm} disabled={!selectedPrivileges.length || !database || (scope !== 'database' && !objectValue) || loading}>
                        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {t('Actions.Confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
