import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import type { ClickHouseRole } from '@/types/privileges';
import type { FormMode, RoleFormValues } from '../types';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/registry/new-york-v4/ui/form';
import { useTranslations } from 'next-intl';

export type RoleDialogProps = {
    open: boolean;
    mode: FormMode;
    onClose: () => void;
    onSubmit: (values: RoleFormValues) => Promise<void> | void;
    isSubmitting: boolean;
    initialRole: ClickHouseRole | null;
    availableClusters: string[];
    isClustersLoading: boolean;
};

export function RoleDialog({ open, mode, onClose, onSubmit, isSubmitting, initialRole, availableClusters, isClustersLoading }: RoleDialogProps) {
    const t = useTranslations('Privileges');
    const form = useForm<RoleFormValues>({
        defaultValues: {
            name: initialRole?.name ?? '',
            privileges:
                initialRole?.privileges.map(priv => ({
                    privilege: priv.privilege ?? '',
                    database: priv.database ?? '*',
                    table: priv.table ?? '*',
                    columns: (priv.columns ?? []).join(', '),
                    grantOption: Boolean(priv.grantOption),
                })) ?? [{ privilege: '', database: '*', table: '*', columns: '', grantOption: false }],
            onCluster: false,
            cluster: availableClusters[0] ?? null,
        },
    });

    const { control, reset } = form;
    const { fields, append, remove, replace } = useFieldArray({ control, name: 'privileges' });
    const onClusterEnabled = form.watch('onCluster');

    useEffect(() => {
        if (!open) return;

        const defaults =
            initialRole?.privileges.map(priv => ({
                privilege: priv.privilege ?? '',
                database: priv.database ?? '*',
                table: priv.table ?? '*',
                columns: (priv.columns ?? []).join(', '),
                grantOption: Boolean(priv.grantOption),
            })) ?? [{ privilege: '', database: '*', table: '*', columns: '', grantOption: false }];

        reset({
            name: initialRole?.name ?? '',
            privileges: defaults,
            onCluster: false,
            cluster: availableClusters[0] ?? null,
        });
        replace(defaults);
    }, [open, initialRole, reset, replace, availableClusters]);

    const handleSubmit = form.handleSubmit(async values => {
        await onSubmit(values);
    });

    const handleOpenChange = (next: boolean) => {
        if (next) return;

        onClose();
        replace([{ privilege: '', database: '*', table: '*', columns: '', grantOption: false }]);
        reset({
            name: '',
            privileges: [{ privilege: '', database: '*', table: '*', columns: '', grantOption: false }],
            onCluster: false,
            cluster: availableClusters[0] ?? null,
        });
    };

    useEffect(() => {
        if (!availableClusters.length) {
            form.setValue('cluster', null);
            return;
        }

        const currentCluster = form.getValues('cluster');
        if (!currentCluster) {
            form.setValue('cluster', availableClusters[0]);
        }
    }, [availableClusters, form]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create' ? t('RoleDialog.CreateTitle') : t('RoleDialog.EditTitle', { name: initialRole?.name as string })}
                    </DialogTitle>
                    <DialogDescription></DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: t('RoleDialog.Errors.NameRequired') }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('RoleDialog.NameLabel')}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('RoleDialog.NamePlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="onCluster"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <FormLabel>{t('RoleDialog.OnClusterLabel')}</FormLabel>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={next => {
                                                field.onChange(next);
                                                if (next && availableClusters.length && !form.getValues('cluster')) {
                                                    form.setValue('cluster', availableClusters[0]);
                                                }
                                            }}
                                            disabled={isClustersLoading || availableClusters.length === 0}
                                        />
                                    </div>
                                    <FormDescription>{t('RoleDialog.OnClusterDescription')}</FormDescription>
                                </FormItem>
                            )}
                        />

                        {onClusterEnabled ? (
                            <FormField
                                control={form.control}
                                name="cluster"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('RoleDialog.ClusterLabel')}</FormLabel>
                                        <FormControl>
                                            <Select
                                                onValueChange={value => field.onChange(value)}
                                                value={field.value ?? ''}
                                                disabled={isClustersLoading || availableClusters.length === 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder={t('RoleDialog.ClusterPlaceholder')} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="w-full">
                                                    {availableClusters.map(cluster => (
                                                        <SelectItem key={cluster} value={cluster}>
                                                            {cluster}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
                                        <FormDescription>
                                            {isClustersLoading ? (
                                                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    {t('RoleDialog.ClusterLoading')}
                                                </span>
                                            ) : availableClusters.length === 0 ? (
                                                t('RoleDialog.ClusterMissing')
                                            ) : (
                                                t('RoleDialog.ClusterDescription')
                                            )}
                                        </FormDescription>
                                    </FormItem>
                                )}
                            />
                        ) : null}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                {t('Actions.Cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                {mode === 'create' ? t('Actions.Create') : t('Actions.SaveChanges')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
