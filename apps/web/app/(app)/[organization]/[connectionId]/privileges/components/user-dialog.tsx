import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import type { ClickHouseUser } from '@/types/privileges';
import type { FormMode, UserFormValues } from '../types';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/registry/new-york-v4/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/registry/new-york-v4/ui/select';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/registry/new-york-v4/ui/command';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { useTranslations } from 'next-intl';

const PASSWORD_PLACEHOLDER = '********';
const NONE_DEFAULT_ROLE = '__none';

export type UserDialogProps = {
    open: boolean;
    mode: FormMode;
    onClose: () => void;
    onSubmit: (values: UserFormValues, meta: { passwordChanged: boolean }) => Promise<void> | void;
    isSubmitting: boolean;
    initialUser: ClickHouseUser | null;
    availableRoles: string[];
    availableClusters: string[];
    isClustersLoading: boolean;
};

export function UserDialog({
    open,
    mode,
    onClose,
    onSubmit,
    isSubmitting,
    initialUser,
    availableRoles,
    availableClusters,
    isClustersLoading,
}: UserDialogProps) {
    const t = useTranslations('Privileges');
    const form = useForm<UserFormValues>({
        defaultValues: {
            name: initialUser?.name ?? '',
            password: initialUser ? PASSWORD_PLACEHOLDER : '',
            allowedHosts: initialUser?.allowedClientHosts?.join(', ') ?? '',
            roles: initialUser?.grantedRoles ?? [],
            defaultRole: initialUser?.defaultRoles?.[0] ?? null,
            onCluster: false,
            cluster: availableClusters[0] ?? null,
        },
    });

    const { reset } = form;
    const [passwordChanged, setPasswordChanged] = useState(false);
    const selectedRoles = form.watch('roles') ?? [];
    const onClusterEnabled = form.watch('onCluster');

    useEffect(() => {
        const currentDefault = form.getValues('defaultRole');
        if (currentDefault && !selectedRoles.includes(currentDefault)) {
            form.setValue('defaultRole', null);
        }
    }, [form, selectedRoles]);

    useEffect(() => {
        if (!open) return;

        reset({
            name: initialUser?.name ?? '',
            password: initialUser ? PASSWORD_PLACEHOLDER : '',
            allowedHosts: initialUser?.allowedClientHosts?.join(', ') ?? '',
            roles: initialUser?.grantedRoles ?? [],
            defaultRole: initialUser?.defaultRoles?.[0] ?? null,
            onCluster: false,
            cluster: availableClusters[0] ?? null,
        });
        setPasswordChanged(false);
    }, [open, initialUser, reset, availableClusters]);

    const handleSubmit = form.handleSubmit(async values => {
        const sanitizedPassword = values.password === PASSWORD_PLACEHOLDER ? '' : values.password;
        await onSubmit(
            { ...values, password: sanitizedPassword },
            {
                passwordChanged: passwordChanged && (mode === 'create' || values.password !== PASSWORD_PLACEHOLDER),
            },
        );
    });

    const handleOpenChange = (next: boolean) => {
        if (next) return;

        onClose();
        reset({
            name: '',
            password: '',
            allowedHosts: '',
            roles: [],
            defaultRole: null,
            onCluster: false,
            cluster: availableClusters[0] ?? null,
        });
        setPasswordChanged(false);
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

    const roleOptions = useMemo(() => {
        const combined = [...availableRoles, ...selectedRoles];
        const unique = Array.from(new Set(combined.filter(Boolean)));
        return unique.sort((a, b) => a.localeCompare(b, 'en')); // localeSort for stability
    }, [availableRoles, selectedRoles]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create' ? t('UserDialog.CreateTitle') : t('UserDialog.EditTitle', { name: initialUser?.name as string })}
                    </DialogTitle>
                    
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: t('UserDialog.Errors.NameRequired') }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('UserDialog.NameLabel')}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('UserDialog.NamePlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('UserDialog.PasswordLabel')}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            placeholder={mode === 'create' ? t('UserDialog.PasswordPlaceholderCreate') : t('UserDialog.PasswordPlaceholderEdit')}
                                            disabled={isSubmitting}
                                            {...field}
                                            onChange={event => {
                                                setPasswordChanged(true);
                                                field.onChange(event);
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {mode === 'create' ? t('UserDialog.PasswordHintCreate') : t('UserDialog.PasswordHintEdit')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="allowedHosts"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('UserDialog.AllowedHostsLabel')}</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder={t('UserDialog.AllowedHostsPlaceholder')} rows={3} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="roles"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('UserDialog.RolesLabel')}</FormLabel>
                                    <RolesMultiSelect
                                        value={field.value ?? []}
                                        onChange={field.onChange}
                                        options={roleOptions}
                                        disabled={isSubmitting || roleOptions.length === 0}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="defaultRole"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('UserDialog.DefaultRoleLabel')}</FormLabel>
                                    <Select
                                        onValueChange={value => field.onChange(value === NONE_DEFAULT_ROLE ? null : value)}
                                        value={field.value ?? NONE_DEFAULT_ROLE}
                                        disabled={isSubmitting || selectedRoles.length === 0}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder={t('UserDialog.DefaultRolePlaceholder')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="w-full">
                                            <SelectItem value={NONE_DEFAULT_ROLE}>{t('UserDialog.DefaultRoleNone')}</SelectItem>
                                            {selectedRoles.map(role => (
                                                <SelectItem key={role} value={role}>
                                                    {role}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
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
                                        <FormLabel>{t('UserDialog.OnClusterLabel')}</FormLabel>
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
                                    <FormDescription>{t('UserDialog.OnClusterDescription')}</FormDescription>
                                </FormItem>
                            )}
                        />
                        {onClusterEnabled ? (
                            <FormField
                                control={form.control}
                                name="cluster"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('UserDialog.ClusterLabel')}</FormLabel>
                                        <FormControl>
                                            <Select
                                                onValueChange={value => field.onChange(value)}
                                                value={field.value ?? ''}
                                                disabled={isClustersLoading || availableClusters.length === 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder={t('UserDialog.ClusterPlaceholder')} />
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
                                                    {t('UserDialog.ClusterLoading')}
                                                </span>
                                            ) : availableClusters.length === 0 ? (
                                                t('UserDialog.ClusterMissing')
                                            ) : (
                                                t('UserDialog.ClusterDescription')
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

type RolesMultiSelectProps = {
    value: string[];
    onChange: (next: string[]) => void;
    options: string[];
    disabled?: boolean;
};

function RolesMultiSelect({ value, onChange, options, disabled }: RolesMultiSelectProps) {
    const t = useTranslations('Privileges');
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return options;
        const query = search.toLowerCase();
        return options.filter(option => option.toLowerCase().includes(query));
    }, [options, search]);

    const toggleValue = (role: string) => {
        if (value.includes(role)) {
            onChange(value.filter(item => item !== role));
        } else {
            onChange([...value, role]);
        }
    };

    const buttonLabel = value.length ? value.join(', ') : t('UserDialog.RolesPlaceholder');

    const handleOpenChange = (next: boolean) => {
        if (disabled) return;
        setOpen(next);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                    disabled={disabled}
                >
                    <span className="truncate text-sm">{buttonLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t('UserDialog.RolesSearchPlaceholder')} value={search} onValueChange={setSearch} />
                    <CommandList>
                        <CommandEmpty>{t('UserDialog.RolesEmpty')}</CommandEmpty>
                        <CommandGroup>
                            {filtered.map(role => {
                                const selected = value.includes(role);
                                return (
                                    <CommandItem
                                        key={role}
                                        value={role}
                                        onSelect={() => toggleValue(role)}
                                        className="flex items-center gap-2"
                                    >
                                        <div
                                            className={cn(
                                                'border-input pointer-events-none flex size-4 shrink-0 items-center justify-center rounded border transition data-[selected=true]:border-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                                            )}
                                            data-selected={selected}
                                        >
                                            <Check className={cn('h-3 w-3', selected ? 'opacity-100' : 'opacity-0')} />
                                        </div>
                                        <span className="flex-1 truncate text-sm">{role}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
