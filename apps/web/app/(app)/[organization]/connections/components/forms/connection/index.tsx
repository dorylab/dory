import { type FieldValues, UseFormReturn, useWatch } from 'react-hook-form';
import { Check, CircleOff, Code2, FlaskConical, Rocket, User, Users } from 'lucide-react';
import { cn } from '@dory/web-utils';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { useTranslations } from 'next-intl';
import RequiredMark from '../../require-mark';
import { CONNECTION_TYPE_OPTIONS, getConnectionDriver } from './drivers';
import { DatabaseTypeIcon } from '../../database-type-icon';
import { createTlsDefaultsForConnectionType } from '../tls/utils';
import { CONNECTION_ENVIRONMENT_OPTIONS, CONNECTION_TAG_COLOR_OPTIONS, normalizeConnectionEnvironmentValue, normalizeConnectionTagColorValue } from '../../../constants';
import type { ConnectionEnvironmentValue } from '../../../constants';

const EMPTY_ENVIRONMENT_SELECT_VALUE = '__none__';
const ENVIRONMENT_OPTION_ICONS = {
    '': CircleOff,
    dev: Code2,
    staging: FlaskConical,
    prod: Rocket,
    personal: User,
    shared: Users,
} satisfies Record<ConnectionEnvironmentValue, typeof CircleOff>;

const BETA_CONNECTION_TYPES = new Set(['snowflake', 'supabase']);

function ConnectionTypeOptionLabel({ value, label }: { value: string; label: string }) {
    const isBeta = BETA_CONNECTION_TYPES.has(value);

    return (
        <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <DatabaseTypeIcon type={value} className="max-h-4 max-w-4" fallbackClassName="text-[10px]" />
            </span>
            <span className="truncate">{label}</span>
            {isBeta ? (
                <span aria-label={`${label} beta`} className="rounded-full bg-primary/10 px-1.5 text-[9px] leading-4 font-semibold tracking-[0.02em] text-primary">
                    BETA
                </span>
            ) : null}
        </span>
    );
}

export default function ConnectionForm(props: { form: UseFormReturn<FieldValues> }) {
    const { form } = props;
    const { control } = form;
    const t = useTranslations('Connections.ConnectionContent');
    const connectionType = useWatch({
        control,
        name: 'connection.type',
    });
    const driver = getConnectionDriver(connectionType);
    const DriverFields = driver.FormComponent;

    const handleTypeChange = (nextType: string, onChange: (value: string) => void) => {
        const nextDriver = getConnectionDriver(nextType);
        const currentConnection = form.getValues('connection') ?? {};
        const nextDefaults = nextDriver.createDefaults();

        onChange(nextType);

        form.setValue('connection.host', currentConnection.host ?? nextDefaults.host, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.port', nextDefaults.port, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.httpPort', nextDefaults.httpPort, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.database', nextDefaults.database, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.path', currentConnection.path ?? nextDefaults.path ?? null, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.accountId', nextDefaults.accountId, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.duckdbMode', nextDefaults.duckdbMode, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.warehouse', nextDefaults.warehouse, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.schema', nextDefaults.schema, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.authMethod', nextDefaults.authMethod, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.ssl', nextDefaults.ssl, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.encrypt', nextDefaults.encrypt, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.trustServerCertificate', nextDefaults.trustServerCertificate, {
            shouldDirty: true,
            shouldValidate: false,
        });
        form.setValue('tls', createTlsDefaultsForConnectionType(nextType), { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.description', currentConnection.description ?? nextDefaults.description, {
            shouldDirty: true,
            shouldValidate: false,
        });
        form.setValue('connection.environment', normalizeConnectionEnvironmentValue(currentConnection.environment ?? nextDefaults.environment), {
            shouldDirty: true,
            shouldValidate: false,
        });
        form.setValue('connection.tags', normalizeConnectionTagColorValue(currentConnection.tags ?? nextDefaults.tags), {
            shouldDirty: true,
            shouldValidate: false,
        });

        form.clearErrors([
            'connection.type',
            'connection.host',
            'connection.port',
            'connection.httpPort',
            'connection.database',
            'connection.path',
            'connection.accountId',
            'connection.duckdbMode',
            'connection.warehouse',
            'connection.schema',
            'connection.authMethod',
            'connection.ssl',
        ]);
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem] items-start">
                <FormField
                    control={control}
                    name="connection.name"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>
                                {t('Connection Name')}
                                <RequiredMark />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder={t('Connection Name Placeholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="connection.type"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>
                                {t('Type')}
                                <RequiredMark />
                            </FormLabel>
                            <Select value={field.value} onValueChange={value => handleTypeChange(value, field.onChange)}>
                                <FormControl>
                                    <SelectTrigger className="w-full min-w-0">
                                        <SelectValue placeholder={t('Select Database Type')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {CONNECTION_TYPE_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            <ConnectionTypeOptionLabel value={option.value} label={option.label} />
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <DriverFields key={connectionType} form={form} />
        </div>
    );
}

export function ConnectionMetadataForm(props: { form: UseFormReturn<FieldValues> }) {
    const { form } = props;
    const tc = useTranslations('Connections');

    return (
        <div className="space-y-4">
            <FormField
                control={form.control}
                name="connection.environment"
                render={({ field }) => {
                    const environmentValue = normalizeConnectionEnvironmentValue(field.value);
                    const selectedEnvironmentOption = CONNECTION_ENVIRONMENT_OPTIONS.find(option => option.value === environmentValue) ?? CONNECTION_ENVIRONMENT_OPTIONS[0];
                    const SelectedEnvironmentIcon = ENVIRONMENT_OPTION_ICONS[selectedEnvironmentOption.value];

                    return (
                        <FormItem className="space-y-2">
                            <FormLabel>{tc('Environment')}</FormLabel>
                            <Select
                                value={environmentValue || EMPTY_ENVIRONMENT_SELECT_VALUE}
                                onValueChange={value => field.onChange(value === EMPTY_ENVIRONMENT_SELECT_VALUE ? '' : value)}
                            >
                                <FormControl>
                                    <SelectTrigger className="w-full max-w-64">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <SelectedEnvironmentIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <SelectValue>{tc(selectedEnvironmentOption.translationKey)}</SelectValue>
                                        </span>
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent align="start">
                                    {CONNECTION_ENVIRONMENT_OPTIONS.map(option => {
                                        const Icon = ENVIRONMENT_OPTION_ICONS[option.value];

                                        return (
                                            <SelectItem key={option.value || 'none'} value={option.value || EMPTY_ENVIRONMENT_SELECT_VALUE}>
                                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                                {tc(option.translationKey)}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    );
                }}
            />

            <FormField
                control={form.control}
                name="connection.tags"
                render={({ field }) => {
                    const tagValue = normalizeConnectionTagColorValue(field.value);

                    return (
                        <FormItem className="space-y-2">
                            <FormLabel>{tc('Tag')}</FormLabel>
                            <FormControl>
                                <div role="radiogroup" aria-label={tc('Tag')} className="flex min-h-9 min-w-0 flex-wrap items-center gap-2">
                                    {CONNECTION_TAG_COLOR_OPTIONS.map(option => {
                                        const selected = tagValue === option.value;
                                        const isEmptyOption = option.value === '';

                                        return (
                                            <button
                                                key={option.value || 'none'}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                aria-label={tc(option.translationKey)}
                                                title={tc(option.translationKey)}
                                                className={cn(
                                                    'inline-flex h-7 cursor-pointer items-center justify-center rounded-full border text-xs transition-[color,box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                    isEmptyOption ? 'px-2.5' : 'w-7 px-0',
                                                    selected ? option.selectedClassName : 'border-border bg-background text-muted-foreground hover:bg-muted',
                                                )}
                                                onClick={() => field.onChange(option.value)}
                                            >
                                                {isEmptyOption ? (
                                                    <span className="font-medium">{tc(option.translationKey)}</span>
                                                ) : (
                                                    <span className="relative flex h-4 w-4 items-center justify-center">
                                                        <span className={cn('absolute inset-0 rounded-full', option.swatchClassName)} />
                                                        {selected ? <Check className="relative h-3 w-3 text-white drop-shadow-sm" /> : null}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    );
                }}
            />
        </div>
    );
}
