'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Cable, ChevronDown, ChevronUp, Loader2, Lock, Server, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/registry/new-york-v4/ui/form';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';

import type { ConnectionListItem } from '@dory/shared/types/connections';

import SSHConnectionForm from './forms/ssh/ssh-form';
import { TLSConnectionForm } from './forms/tls/tls-form';
import ConnectionForm from './forms/connection';
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

export function ConnectionDialog({
    open,
    onOpenChange,
    mode = 'Create',
    connectionItem,
    onSuccess,
}: any & {
    mode?: Mode;
    connectionItem?: ConnectionListItem | null;
    onSuccess?: () => void;
}) {
    const [submitting, setSubmitting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [sshOpen, setSshOpen] = useState(false);
    const [tlsOpen, setTlsOpen] = useState(false);
    const [savePassword, setSavePassword] = useState(true);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('Connections');
    const tc = useTranslations('Connections.ConnectionContent');

    const testConnectionMutation = useTestConnection();
    const createConnectionMutation = useCreateConnection();
    const updateConnectionMutation = useUpdateConnection();

    const form = useForm<any>({
        resolver: zodResolver(ConnectionDialogFormSchema),
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
    const isMotherDuck = isDuckDb && duckDbMode === 'motherduck';
    const hidesIdentityForm = isSqlite || isNeon || isDuckDb;
    const hidesSshForm = isSqlite || isNeon || isDuckDb;
    const hidesTlsForm = !TLS_SUPPORTED_CONNECTION_TYPES.has(connectionType);

    const isEditMode = mode === 'Edit' && Boolean(connectionItem?.connection?.id);

    const resetDialogState = () => {
        setTesting(false);
        setSavePassword(true);
        reset(NEW_CONNECTION_DEFAULT_VALUES);
    };

    const normalizeSshValues = (sshValues: any, connectionId?: string | null) => {
        if (!sshValues) return null;
        const { user, username, ...rest } = sshValues;
        const normalized = {
            ...rest,
            username: typeof username !== 'undefined' ? username : typeof user !== 'undefined' ? user : null,
        } as any;
        if (connectionId) normalized.connectionId = connectionId;
        return normalized;
    };

    const normalizeIdentityValues = (identityValues: any) => {
        if (isNeon) {
            const fallbackIdentity = connectionItem?.identities?.find((iden: any) => iden.isDefault);

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

    const normalizeIdentityPasswordForSubmit = (identityValues: any, intent: 'save' | 'test') => {
        if (!savePassword && identityValues) {
            if (intent === 'test' && typeof identityValues.password === 'string' && identityValues.password.trim() !== '') {
                return identityValues;
            }
            return { ...identityValues, password: null };
        }

        if (!isEditMode || !identityValues || typeof identityValues.password !== 'string' || identityValues.password.trim() !== '') {
            return identityValues;
        }

        const { password: _password, ...identityWithoutPassword } = identityValues;
        return identityWithoutPassword;
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
            const formIdentity = connectionItem.identities?.find((iden: any) => iden.isDefault) || {};
            const driver = getConnectionDriver(connectionItem.connection?.type ?? connectionItem.connection?.engine);
            const nextValues = {
                connection: normalizeConnectionMetadataValues(driver.normalizeForForm(connectionItem.connection)),
                ssh: connectionItem.ssh ? { ...connectionItem.ssh } : { ...(NEW_CONNECTION_DEFAULT_VALUES as any).ssh },
                tls: normalizeTlsForForm(connectionItem.connection, (connectionItem as any).tls),
                identity: {
                    ...(NEW_CONNECTION_DEFAULT_VALUES as any).identity,
                    ...formIdentity,
                },
            } as any;
            if (connectionItem.connection?.type === 'neon') {
                nextValues.connection.host = buildNeonConnectionStringForForm(connectionItem.connection, formIdentity);
            }
            reset(nextValues);
            setSavePassword(true);
            setSshOpen(connectionItem.connection?.type === 'neon' ? false : Boolean((connectionItem as any).ssh?.enabled));
            setTlsOpen(false);
        } else {
            reset({
                ...(NEW_CONNECTION_DEFAULT_VALUES as any),
                tls: createTlsDefaultsForConnectionType((NEW_CONNECTION_DEFAULT_VALUES as any).connection?.type),
            });
            setSavePassword(true);
            setSshOpen(Boolean((NEW_CONNECTION_DEFAULT_VALUES as any).ssh?.enabled));
            setTlsOpen(false);
        }
    }, [open, isEditMode, connectionItem, reset]);

    const onSaveSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            const connectionId = connectionItem?.connection?.id;
            const defaultIdentity = connectionItem?.identities?.find((iden: any) => iden.isDefault);
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

                const updateValues: any = {
                    ...savedValues,
                    id: connectionItem.connection.id,
                };
                console.log('Updating connection with values:', updateValues);
                await updateConnectionMutation.mutateAsync(updateValues as any);
            } else {
                await createConnectionMutation.mutateAsync(savedValues as any);
            }

            onOpenChange(false);
            onSuccess && onSuccess();
            resetDialogState();
        } finally {
            setSubmitting(false);
        }
    };

    const onValidTest = async (values: any) => {
        const sshPayload = hidesSshForm ? { enabled: false, host: null, port: null, username: null, authMethod: null } : normalizeSshValues(values.ssh);
        const tlsPayload = hidesTlsForm ? null : normalizeTlsForSubmit(values.connection?.type, values.tls);
        const driver = getConnectionDriver(values.connection?.type);
        const normalizedConnection = driver.normalizeForSubmit(normalizeConnectionValuesForSubmit(values.connection, tlsPayload));
        const normalizedIdentity = normalizeIdentityPasswordForSubmit(normalizeIdentityValues(values.identity), 'test');
        let testPayload = { ...values, ssh: sshPayload };
        if (mode === 'Edit') {
            const mergedSsh = sshPayload ? { ...currentConnection?.ssh, ...sshPayload } : (currentConnection?.ssh ?? null);
            testPayload = {
                connection: { ...currentConnection?.connection, ...normalizedConnection },
                identity: { ...currentConnection?.identities?.find((iden: any) => iden.isDefault), ...normalizedIdentity },
                ssh: mergedSsh,
                tls: tlsPayload ?? (currentConnection as any)?.tls ?? null,
            };
        } else {
            testPayload = { ...values, connection: normalizedConnection, identity: normalizedIdentity, ssh: sshPayload, tls: tlsPayload };
        }
        setTesting(true);
        try {
            await testConnectionMutation.mutateAsync(testPayload);
        } catch (error) {
            console.error(error);
        } finally {
            setTesting(false);
        }
    };

    const onInvalidTest = (errors: any) => {
        console.log('test connection validation errors:', errors);
        toast.error(t('Fix Form Errors Before Testing'));
    };

    const handleTestConnection = () => {
        handleSubmit(onValidTest, onInvalidTest)();
    };

    const onInvalidSave = (errors: any) => {
        console.log('save connection validation errors:', errors);
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
            <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col" data-testid="connection-dialog" onPointerDownOutside={event => event.preventDefault()}>
                <DialogHeader className="shrink-0">
                    <DialogTitle>{isEditMode ? tc('Edit.title') : tc('Create.title')}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form className="flex flex-col flex-1" onSubmit={handleSubmit(onSaveSubmit, onInvalidSave)}>
                        <ScrollArea className="overflow-hidden pr-2 h-[70vh]">
                            <div className="space-y-4 pb-4">
                                <section className="rounded-xl border border-border/70 bg-background/80 p-4 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                                            <Server className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Connection Info')}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <ConnectionForm form={form} />

                                        {!hidesIdentityForm ? <p className="text-xs text-muted-foreground mt-3">{t('Authentication Info')}</p> : null}
                                        {!hidesIdentityForm ? (
                                            <IdentityForm form={form} isEditMode={isEditMode} savePassword={savePassword} onSavePasswordChange={setSavePassword} />
                                        ) : null}
                                    </div>
                                </section>

                                {!hidesTlsForm ? (
                                    <section className="mt-2 rounded-xl border border-border/70 bg-background/80">
                                        <Collapsible open={tlsOpen} onOpenChange={setTlsOpen}>
                                            <div className="flex items-center justify-between px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                                                        <Lock className="h-3 w-3 text-muted-foreground" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">TLS/SSL</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <FormField
                                                        control={control}
                                                        name="tls.mode"
                                                        render={({ field }) => (
                                                            <FormItem className="flex items-center gap-2">
                                                                <FormLabel className="text-xs text-muted-foreground">{t('Enable')}</FormLabel>
                                                                <FormControl>
                                                                    <Switch
                                                                        checked={field.value !== 'disable'}
                                                                        onCheckedChange={checked => {
                                                                            const nextMode = checked ? (connectionType === 'sqlserver' ? 'require' : 'require') : 'disable';
                                                                            field.onChange(nextMode);
                                                                            setTlsOpen(checked);
                                                                        }}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <CollapsibleTrigger asChild>
                                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-muted/60">
                                                            {tlsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                </div>
                                            </div>

                                            <CollapsibleContent className="border-t border-border/60 bg-muted/20 px-4 py-4">
                                                <TLSConnectionForm form={form} connectionType={connectionType} />
                                            </CollapsibleContent>
                                        </Collapsible>
                                    </section>
                                ) : null}

                                {!hidesSshForm ? (
                                    <section className="mt-2 rounded-xl border border-border/70 bg-background/80">
                                        <Collapsible open={sshOpen} onOpenChange={setSshOpen}>
                                            <div className="flex items-center justify-between px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                                                        <Shield className="h-3 w-3 text-muted-foreground" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tc('SSH')}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <FormField
                                                        control={control}
                                                        name="ssh.enabled"
                                                        render={({ field }) => (
                                                            <FormItem className="flex items-center gap-2">
                                                                <FormLabel className="text-xs text-muted-foreground">{t('Enable')}</FormLabel>
                                                                <FormControl>
                                                                    <Switch
                                                                        checked={field.value}
                                                                        onCheckedChange={checked => {
                                                                            field.onChange(checked);
                                                                            setSshOpen(checked);
                                                                        }}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <CollapsibleTrigger asChild>
                                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-muted/60">
                                                            {sshOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                </div>
                                            </div>

                                            <CollapsibleContent className="border-t border-border/60 bg-muted/20 px-4 py-4">
                                                <SSHConnectionForm form={form} />
                                            </CollapsibleContent>
                                        </Collapsible>
                                    </section>
                                ) : null}
                            </div>
                        </ScrollArea>

                        <DialogFooter className="shrink-0 pt-4 mt-2 bg-background flex lg:justify-between">
                            <div>
                                <Button type="button" onClick={handleTestConnection} disabled={submitting || testing} data-testid="test-connection">
                                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cable className="mr-2 h-4 w-4" />}
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
