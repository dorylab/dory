'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ChevronDown, ChevronUp, Loader2, Server, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/registry/new-york-v4/ui/form';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';

import type { ConnectionListItem } from '@/types/connections';

import SSHConnectionForm from './forms/ssh/ssh-form';
import ConnectionForm from './forms/connection';
import IdentityForm from './forms/identity';

import { useCreateConnection, useTestConnection, useUpdateConnection } from '../hooks/use-connections';
import { NEW_CONNECTION_DEFAULT_VALUES } from '../constants';
import { ConnectionDialogFormSchema } from '../form-schema';
import { useAtomValue } from 'jotai';
import { currentConnectionAtom } from '@/shared/stores/app.store';

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

    const isEditMode = mode === 'Edit' && Boolean(connectionItem?.connection?.id);

    

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

    useEffect(() => {
        if (!open) return;

        if (isEditMode && connectionItem) {
            console.log('Editing connection:', connectionItem);
            const formIdentity = connectionItem.identities?.find((iden: any) => iden.isDefault) || {};
            const nextValues = {
                connection: connectionItem.connection,
                ssh: connectionItem.ssh ? { ...connectionItem.ssh } : { ...(NEW_CONNECTION_DEFAULT_VALUES as any).ssh },
                identity: formIdentity,
            } as any;
            reset(nextValues);
            setSshOpen(Boolean((connectionItem as any).ssh?.enabled));
        } else {
            reset(NEW_CONNECTION_DEFAULT_VALUES as any);
            setSshOpen(Boolean((NEW_CONNECTION_DEFAULT_VALUES as any).ssh?.enabled));
        }
    }, [open, isEditMode, connectionItem, reset]);

    
    const onSaveSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            const connectionId = connectionItem?.connection?.id;
            const defaultIdentity = connectionItem?.identities?.find((iden: any) => iden.isDefault);
            const sshPayload = normalizeSshValues(values.ssh, isEditMode ? connectionId : null);

            const savedValues = {
                connection: isEditMode ? { ...values.connection, id: connectionId } : values.connection,
                ssh: sshPayload,
                identities: [
                    isEditMode
                        ? {
                            ...values.identity,
                            id: values.identity?.id ?? defaultIdentity?.id,
                        }
                        : values.identity,
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
                await updateConnectionMutation.mutateAsync(updateValues);
            } else {
                await createConnectionMutation.mutateAsync(savedValues);
            }

            onOpenChange(false);
            onSuccess && onSuccess();
            reset(NEW_CONNECTION_DEFAULT_VALUES);
        } finally {
            setSubmitting(false);
        }
    };

    
    const onValidTest = async (values: any) => {
        const sshPayload = normalizeSshValues(values.ssh);
        let testPayload = { ...values, ssh: sshPayload };
        if (mode === 'Edit') {
            const mergedSsh = sshPayload ? { ...currentConnection?.ssh, ...sshPayload } : currentConnection?.ssh ?? null;
            testPayload = {
                connection: { ...currentConnection?.connection, ...values.connection },
                identity: { ...currentConnection?.identities?.find((iden: any) => iden.isDefault), ...values.identity },
                ssh: mergedSsh,
            };
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

    const handleClose = () => {
        if (submitting) return;
        onOpenChange(false);
        reset(NEW_CONNECTION_DEFAULT_VALUES);
    };

    return (
        <Dialog open={open} onOpenChange={open => !submitting && onOpenChange(open)}>
            <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{isEditMode ? tc('Edit.title') : tc('Create.title')}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form className="flex flex-col flex-1" onSubmit={handleSubmit(onSaveSubmit)}>
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

                                        <p className="text-xs text-muted-foreground mt-3">{t('Authentication Info')}</p>

                                        <IdentityForm form={form} />
                                    </div>
                                </section>

                                
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
                            </div>
                        </ScrollArea>

                        
                        <DialogFooter className="shrink-0 pt-4 mt-2 bg-background flex lg:justify-between">
                            <div>
                                <Button type="button" onClick={handleTestConnection} disabled={submitting || testing}>
                                    {testing ? t('Testing Connection') : tc('TestConnection')}
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                                    {t('Cancel')}
                                </Button>
                                <Button type="submit" disabled={submitting}>
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
