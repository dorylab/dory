'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type FieldErrors, type FieldValues, type Resolver, useForm, useWatch } from 'react-hook-form';
import { FlaskConical, KeyRound, Loader2, Lock, Server, Shield, Tags, TriangleAlert, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@dory/web-utils';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/registry/new-york-v4/ui/form';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';

import type { ConnectionListItem } from '@dory/shared/types/connections';

import SSHConnectionForm from './forms/ssh/ssh-form';
import { TLSConnectionForm } from './forms/tls/tls-form';
import ConnectionForm, { ConnectionMetadataForm } from './forms/connection';
import IdentityForm from './forms/identity';

import { useCreateConnection, useTestConnection, useUpdateConnection } from '../hooks/use-connections';
import { NEW_CONNECTION_DEFAULT_VALUES, normalizeConnectionEnvironmentValue, normalizeConnectionTagColorValue } from '../constants';
import { ConnectionDialogFormSchema } from '../form-schema';
import { useAtomValue } from 'jotai';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { getConnectionDriver } from './forms/connection/drivers';
import { buildNeonConnectionStringForForm, normalizeNeonIdentityFromConnectionString } from './forms/connection/drivers/neon';
import { createTlsDefaultsForConnectionType, normalizeTlsForForm, normalizeTlsForSubmit, TLS_SUPPORTED_CONNECTION_TYPES } from './forms/tls/utils';

type Mode = 'Create' | 'Edit';
type ConnectionDialogSection = 'general' | 'ssh' | 'tls' | 'metadata';

type ConnectionDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode?: Mode;
    connectionItem?: ConnectionListItem | null;
    onSuccess?: () => void;
};

type ConnectionIdentityFormValues = {
    id?: string | null;
    name?: string;
    username?: string | null;
    role?: string | null;
    password?: string | null;
    privateKey?: string | null;
    privateKeyPassphrase?: string | null;
    isDefault?: boolean;
    database?: string | null;
};

type ConnectionSshFormValues = Record<string, unknown> & {
    user?: string | null;
    username?: string | null;
    connectionId?: string | null;
};

type ConnectionDialogSectionItem = {
    id: ConnectionDialogSection;
    label: string;
    icon: LucideIcon;
    hasError: boolean;
};

const CONNECTION_SECTION_ERROR_PATHS: Record<ConnectionDialogSection, string[]> = {
    general: [
        'connection.type',
        'connection.name',
        'connection.description',
        'connection.host',
        'connection.port',
        'connection.httpPort',
        'connection.database',
        'connection.connectString',
        'connection.path',
        'connection.accountId',
        'connection.duckdbMode',
        'connection.ssl',
        'connection.encrypt',
        'connection.trustServerCertificate',
        'identity',
    ],
    ssh: ['ssh'],
    tls: ['tls'],
    metadata: ['connection.environment', 'connection.tags'],
};

function getErrorAtPath(errors: unknown, path: string) {
    return path.split('.').reduce<unknown>((value, key) => {
        if (!value || typeof value !== 'object') return undefined;
        return (value as Record<string, unknown>)[key];
    }, errors);
}

function hasSectionError(errors: unknown, section: ConnectionDialogSection) {
    return CONNECTION_SECTION_ERROR_PATHS[section].some(path => Boolean(getErrorAtPath(errors, path)));
}

function getFirstErrorSection(errors: unknown, availableSections: ConnectionDialogSection[]) {
    return availableSections.find(section => hasSectionError(errors, section)) ?? 'general';
}

function ConnectionFormGroupLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </p>
    );
}

function ConnectionFormSectionHeader({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{children}</span>
        </div>
    );
}

function ConnectionSectionNav({
    sections,
    activeSection,
    onSelect,
}: {
    sections: ConnectionDialogSectionItem[];
    activeSection: ConnectionDialogSection;
    onSelect: (section: ConnectionDialogSection) => void;
}) {
    return (
        <nav className="min-w-0 border-b p-2 md:h-full md:border-r md:border-b-0 md:p-3" aria-label="Connection sections">
            <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {sections.map(section => {
                    const Icon = section.icon;
                    const active = activeSection === section.id;

                    return (
                        <button
                            key={section.id}
                            type="button"
                            className={cn(
                                'relative flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground md:w-full',
                                active && 'bg-muted/40 text-foreground',
                            )}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => onSelect(section.id)}
                        >
                            {active ? <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate">{section.label}</span>
                            {section.hasError ? <TriangleAlert className="ml-auto size-3.5 shrink-0 text-destructive" aria-hidden="true" /> : null}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

export function ConnectionDialog({ open, onOpenChange, mode = 'Create', connectionItem, onSuccess }: ConnectionDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [activeSection, setActiveSection] = useState<ConnectionDialogSection>('general');
    const [savePassword, setSavePassword] = useState(true);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('Connections');
    const tc = useTranslations('Connections.ConnectionContent');

    const testConnectionMutation = useTestConnection();
    const createConnectionMutation = useCreateConnection();
    const updateConnectionMutation = useUpdateConnection();

    const form = useForm<FieldValues>({
        resolver: zodResolver(ConnectionDialogFormSchema) as unknown as Resolver<FieldValues>,
        mode: 'onSubmit',
        reValidateMode: 'onChange',
        defaultValues: NEW_CONNECTION_DEFAULT_VALUES,
    });

    const { control, handleSubmit, reset } = form;
    const connectionType = useWatch({ control, name: 'connection.type' });
    const duckDbMode = useWatch({ control, name: 'connection.duckdbMode' });
    const isSqlite = connectionType === 'sqlite';
    const isNeon = connectionType === 'neon';
    const isDuckDb = connectionType === 'duckdb';
    const isCloudflareD1 = connectionType === 'cloudflare-d1';
    const isSnowflake = connectionType === 'snowflake';
    const isMotherDuck = isDuckDb && duckDbMode === 'motherduck';
    const hidesIdentityForm = isSqlite || isNeon || isDuckDb || isCloudflareD1;
    const hidesSshForm = isSqlite || isNeon || isDuckDb || isCloudflareD1 || isSnowflake;
    const hidesTlsForm = !TLS_SUPPORTED_CONNECTION_TYPES.has(connectionType);

    const isEditMode = mode === 'Edit' && Boolean(connectionItem?.connection?.id);

    const resetDialogState = () => {
        setTesting(false);
        setActiveSection('general');
        setSavePassword(true);
        reset(NEW_CONNECTION_DEFAULT_VALUES);
    };

    const normalizeSshValues = (sshValues: ConnectionSshFormValues | null | undefined, connectionId?: string | null) => {
        if (!sshValues) return null;
        const { user, username, ...rest } = sshValues;
        const normalized: ConnectionSshFormValues = {
            ...rest,
            username: typeof username !== 'undefined' ? username : typeof user !== 'undefined' ? user : null,
        };
        if (connectionId) normalized.connectionId = connectionId;
        return normalized;
    };

    const normalizeIdentityValues = (identityValues: ConnectionIdentityFormValues | null | undefined) => {
        if (isNeon) {
            const fallbackIdentity = connectionItem?.identities?.find(identity => identity.isDefault);

            return normalizeNeonIdentityFromConnectionString(form.getValues('connection.host'), {
                id: fallbackIdentity?.id,
                username: fallbackIdentity?.username,
                database: fallbackIdentity?.database,
            });
        }

        if (isDuckDb) {
            return {
                id: identityValues?.id,
                name: identityValues?.name ?? 'DuckDB',
                username: 'duckdb',
                role: identityValues?.role ?? null,
                password: isMotherDuck ? (identityValues?.password ?? null) : null,
                isDefault: true,
                database: isMotherDuck ? form.getValues('connection.database')?.trim?.() || null : null,
            };
        }

        if (isCloudflareD1) {
            return {
                id: identityValues?.id,
                name: identityValues?.name ?? 'Cloudflare D1',
                username: 'cloudflare',
                role: identityValues?.role ?? null,
                password: identityValues?.password ?? null,
                isDefault: true,
                database: form.getValues('connection.database')?.trim?.() || null,
            };
        }

        if (!isSqlite) {
            return identityValues;
        }

        return {
            id: identityValues?.id,
            name: identityValues?.name ?? 'SQLite',
            username: identityValues?.username?.trim?.() || 'sqlite',
            role: identityValues?.role ?? null,
            password: null,
            isDefault: true,
            database: 'main',
        };
    };

    const normalizeIdentityPasswordForSubmit = (identityValues: ConnectionIdentityFormValues | null | undefined, intent: 'save' | 'test') => {
        if (!savePassword && identityValues) {
            if (
                intent === 'test' &&
                ((typeof identityValues.password === 'string' && identityValues.password.trim() !== '') ||
                    (typeof identityValues.privateKey === 'string' && identityValues.privateKey.trim() !== ''))
            ) {
                return identityValues;
            }
            return { ...identityValues, password: null, privateKey: null, privateKeyPassphrase: null };
        }

        if (!isEditMode || !identityValues) {
            return identityValues;
        }

        const identityWithoutBlankSecrets = { ...identityValues };
        if (typeof identityWithoutBlankSecrets.password === 'string' && identityWithoutBlankSecrets.password.trim() === '') {
            delete identityWithoutBlankSecrets.password;
        }
        if (typeof identityWithoutBlankSecrets.privateKey === 'string' && identityWithoutBlankSecrets.privateKey.trim() === '') {
            delete identityWithoutBlankSecrets.privateKey;
        }
        if (typeof identityWithoutBlankSecrets.privateKeyPassphrase === 'string' && identityWithoutBlankSecrets.privateKeyPassphrase.trim() === '') {
            delete identityWithoutBlankSecrets.privateKeyPassphrase;
        }
        return identityWithoutBlankSecrets;
    };

    const normalizeConnectionMetadataValues = (connectionValues: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined => {
        if (!connectionValues) return connectionValues;

        return {
            ...connectionValues,
            environment: normalizeConnectionEnvironmentValue(connectionValues.environment),
            tags: normalizeConnectionTagColorValue(connectionValues.tags),
        };
    };

    const normalizeConnectionValuesForSubmit = (connectionValues: Record<string, unknown> | null | undefined, tlsPayload: { mode?: string | null } | null) => {
        const normalizedConnectionValues = normalizeConnectionMetadataValues(connectionValues);
        if (normalizedConnectionValues?.type !== 'clickhouse') return normalizedConnectionValues;

        return {
            ...normalizedConnectionValues,
            ssl: (tlsPayload?.mode ?? 'disable') !== 'disable',
        };
    };

    useEffect(() => {
        if (!open) return;

        if (isEditMode && connectionItem) {
            console.log('Editing connection:', connectionItem);
            const formIdentity = connectionItem.identities?.find(identity => identity.isDefault) || {};
            const driver = getConnectionDriver(connectionItem.connection?.type ?? connectionItem.connection?.engine);
            const nextValues: FieldValues = {
                connection: normalizeConnectionMetadataValues(driver.normalizeForForm(connectionItem.connection)),
                ssh: connectionItem.ssh ? { ...connectionItem.ssh } : { ...NEW_CONNECTION_DEFAULT_VALUES.ssh },
                tls: normalizeTlsForForm(connectionItem.connection, connectionItem.tls),
                identity: {
                    ...NEW_CONNECTION_DEFAULT_VALUES.identity,
                    ...formIdentity,
                },
            };
            if (connectionItem.connection?.type === 'neon') {
                nextValues.connection.host = buildNeonConnectionStringForForm(connectionItem.connection, formIdentity);
            }
            reset(nextValues);
            setSavePassword(true);
            setActiveSection('general');
        } else {
            reset({
                ...NEW_CONNECTION_DEFAULT_VALUES,
                tls: createTlsDefaultsForConnectionType(NEW_CONNECTION_DEFAULT_VALUES.connection?.type),
            });
            setSavePassword(true);
            setActiveSection('general');
        }
    }, [open, isEditMode, connectionItem, reset]);

    useEffect(() => {
        if ((activeSection === 'ssh' && hidesSshForm) || (activeSection === 'tls' && hidesTlsForm)) {
            setActiveSection('general');
        }
    }, [activeSection, hidesSshForm, hidesTlsForm]);

    const availableSectionIds: ConnectionDialogSection[] = ['general', ...(!hidesSshForm ? (['ssh'] as const) : []), ...(!hidesTlsForm ? (['tls'] as const) : []), 'metadata'];
    const formErrors = form.formState.errors;
    const sectionItems: ConnectionDialogSectionItem[] = [
        {
            id: 'general',
            label: tc('General'),
            icon: Server,
            hasError: hasSectionError(formErrors, 'general'),
        },
        ...(!hidesSshForm
            ? [
                  {
                      id: 'ssh' as const,
                      label: tc('SSH Tunnel'),
                      icon: Shield,
                      hasError: hasSectionError(formErrors, 'ssh'),
                  },
              ]
            : []),
        ...(!hidesTlsForm
            ? [
                  {
                      id: 'tls' as const,
                      label: tc('TLS/SSL'),
                      icon: Lock,
                      hasError: hasSectionError(formErrors, 'tls'),
                  },
              ]
            : []),
        {
            id: 'metadata',
            label: t('Metadata'),
            icon: Tags,
            hasError: hasSectionError(formErrors, 'metadata'),
        },
    ];

    const focusFirstErrorSection = (errors: unknown) => {
        setActiveSection(getFirstErrorSection(errors, availableSectionIds));
    };

    const onSaveSubmit = async (values: FieldValues) => {
        setSubmitting(true);
        try {
            const connectionId = connectionItem?.connection?.id;
            const defaultIdentity = connectionItem?.identities?.find(identity => identity.isDefault);
            const sshPayload = hidesSshForm
                ? { enabled: false, host: null, port: null, username: null, authMethod: null }
                : normalizeSshValues(values.ssh, isEditMode ? connectionId : null);
            const tlsPayload = hidesTlsForm ? null : normalizeTlsForSubmit(values.connection?.type, values.tls);
            const driver = getConnectionDriver(values.connection?.type);
            const normalizedConnection = driver.normalizeForSubmit(normalizeConnectionValuesForSubmit(values.connection, tlsPayload));
            const normalizedIdentity = normalizeIdentityPasswordForSubmit(normalizeIdentityValues(values.identity), 'save');

            const savedValues = {
                connection: isEditMode ? { ...normalizedConnection, id: connectionId } : normalizedConnection,
                ssh: sshPayload,
                tls: tlsPayload,
                identities: [
                    isEditMode
                        ? {
                              ...normalizedIdentity,
                              id: normalizedIdentity?.id ?? defaultIdentity?.id,
                          }
                        : normalizedIdentity,
                ],
            };
            console.log('onSaveSubmit values:', values, 'savedValues:', savedValues);
            if (isEditMode && connectionItem?.connection?.id) {
                console.log('isEditMode true, updating connection');

                const updateValues = {
                    ...savedValues,
                    id: connectionItem.connection.id,
                };
                console.log('Updating connection with values:', updateValues);
                await updateConnectionMutation.mutateAsync(updateValues as Parameters<typeof updateConnectionMutation.mutateAsync>[0]);
            } else {
                await createConnectionMutation.mutateAsync(savedValues as Parameters<typeof createConnectionMutation.mutateAsync>[0]);
            }

            onOpenChange(false);
            onSuccess?.();
            resetDialogState();
        } finally {
            setSubmitting(false);
        }
    };

    const onValidTest = async (values: FieldValues) => {
        const sshPayload = hidesSshForm ? { enabled: false, host: null, port: null, username: null, authMethod: null } : normalizeSshValues(values.ssh);
        const tlsPayload = hidesTlsForm ? null : normalizeTlsForSubmit(values.connection?.type, values.tls);
        const driver = getConnectionDriver(values.connection?.type);
        const normalizedConnection = driver.normalizeForSubmit(normalizeConnectionValuesForSubmit(values.connection, tlsPayload));
        const normalizedIdentity = normalizeIdentityPasswordForSubmit(normalizeIdentityValues(values.identity), 'test');
        let testPayload: FieldValues = { ...values, ssh: sshPayload };
        if (mode === 'Edit') {
            const mergedSsh = sshPayload ? { ...currentConnection?.ssh, ...sshPayload } : (currentConnection?.ssh ?? null);
            testPayload = {
                connection: { ...currentConnection?.connection, ...normalizedConnection },
                identity: { ...currentConnection?.identities?.find(identity => identity.isDefault), ...normalizedIdentity },
                ssh: mergedSsh,
                tls: tlsPayload ?? currentConnection?.tls ?? null,
            };
        } else {
            testPayload = { ...values, connection: normalizedConnection, identity: normalizedIdentity, ssh: sshPayload, tls: tlsPayload };
        }
        setTesting(true);
        try {
            await testConnectionMutation.mutateAsync(testPayload as Parameters<typeof testConnectionMutation.mutateAsync>[0]);
        } catch (error) {
            console.error(error);
        } finally {
            setTesting(false);
        }
    };

    const onInvalidTest = (errors: FieldErrors<FieldValues>) => {
        console.log('test connection validation errors:', errors);
        focusFirstErrorSection(errors);
        toast.error(t('Fix Form Errors Before Testing'));
    };

    const handleTestConnection = () => {
        handleSubmit(onValidTest, onInvalidTest)();
    };

    const onInvalidSave = (errors: FieldErrors<FieldValues>) => {
        console.log('save connection validation errors:', errors);
        focusFirstErrorSection(errors);
        toast.error(t('Fix Form Errors Before Saving'));
    };

    const handleClose = () => {
        if (submitting) return;
        resetDialogState();
        onOpenChange(false);
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (submitting) return;
        if (!nextOpen) {
            resetDialogState();
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="flex max-h-[95vh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
                data-testid="connection-dialog"
                onPointerDownOutside={event => event.preventDefault()}
            >
                <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
                    <DialogTitle>{isEditMode ? tc('Edit.title') : tc('Create.title')}</DialogTitle>
                    <DialogDescription className="sr-only">{isEditMode ? tc('Edit.title') : tc('Create.title')}</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSaveSubmit, onInvalidSave)}>
                        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[196px_minmax(0,1fr)]">
                            <ConnectionSectionNav sections={sectionItems} activeSection={activeSection} onSelect={setActiveSection} />

                            <ScrollArea className="h-[62vh] min-h-0 md:h-[70vh]">
                                <div className="space-y-6 p-5">
                                    {activeSection === 'general' ? (
                                        <section className="space-y-6">
                                            <div className="space-y-3">
                                                <ConnectionFormGroupLabel icon={Server}>{tc('General')}</ConnectionFormGroupLabel>
                                                <ConnectionForm form={form} />
                                            </div>

                                            {!hidesIdentityForm ? (
                                                <div className="space-y-3 border-t pt-5">
                                                    <ConnectionFormGroupLabel icon={KeyRound}>{t('Authentication Info')}</ConnectionFormGroupLabel>
                                                    <IdentityForm form={form} isEditMode={isEditMode} savePassword={savePassword} onSavePasswordChange={setSavePassword} />
                                                </div>
                                            ) : null}
                                        </section>
                                    ) : null}

                                    {activeSection === 'ssh' && !hidesSshForm ? (
                                        <section className="space-y-5">
                                            <div className="flex items-center justify-between gap-3">
                                                <ConnectionFormSectionHeader icon={Shield}>{tc('SSH Tunnel')}</ConnectionFormSectionHeader>
                                                <FormField
                                                    control={control}
                                                    name="ssh.enabled"
                                                    render={({ field }) => (
                                                        <FormItem className="flex items-center gap-2">
                                                            <FormLabel className="text-xs text-muted-foreground">{t('Enable')}</FormLabel>
                                                            <FormControl>
                                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <SSHConnectionForm form={form} />
                                        </section>
                                    ) : null}

                                    {activeSection === 'tls' && !hidesTlsForm ? (
                                        <section className="space-y-5">
                                            <ConnectionFormSectionHeader icon={Lock}>{tc('TLS/SSL')}</ConnectionFormSectionHeader>
                                            <TLSConnectionForm form={form} connectionType={connectionType} />
                                        </section>
                                    ) : null}

                                    {activeSection === 'metadata' ? (
                                        <section className="space-y-3">
                                            <ConnectionFormGroupLabel icon={Tags}>{t('Metadata')}</ConnectionFormGroupLabel>
                                            <ConnectionMetadataForm form={form} />
                                        </section>
                                    ) : null}
                                </div>
                            </ScrollArea>
                        </div>

                        <DialogFooter className="flex shrink-0 border-t bg-background px-5 py-4 lg:justify-between">
                            <div>
                                <Button type="button" size="sm" className="gap-1" onClick={handleTestConnection} disabled={submitting || testing} data-testid="test-connection">
                                    {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="mr-1 h-3.5 w-3.5" />}
                                    {testing ? t('Testing Connection') : tc('TestConnection')}
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                                    {t('Cancel')}
                                </Button>
                                <Button type="submit" disabled={submitting} data-testid="save-connection">
                                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {submitting ? (isEditMode ? t('Saving') : t('Creating')) : isEditMode ? t('Save Changes') : t('Create Connection')}
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
