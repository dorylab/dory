'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BookOpen, CircleHelp, ExternalLink, KeyRound, Loader2, Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/registry/new-york-v4/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import {
    AI_PROVIDER_OPTIONS,
    getAiProviderIconSrc,
    getAiProviderModelOptions,
    getDefaultAiProviderBaseUrl,
    getDefaultAiProviderModel,
    isAiProviderApiKeyRequired,
    isAiProviderAvailable,
    isAiProviderModelAllowed,
    isAiProviderModelManual,
} from '@dory/ee/ai/provider-options';
import { cn } from '@dory/web-utils';
import type { OrganizationAiProviderType } from '@dory/database/postgres/impl/organization-ai-providers';

type AiProvider = OrganizationAiProviderType;
type AiProviderRowSource = 'system' | 'organization';
type AiProviderRowStatus = 'active' | 'enabled' | 'disabled' | 'unconfigured';

type AiProviderRow = {
    id: string;
    source: AiProviderRowSource;
    displayName: string;
    provider: string;
    providerLabel: string;
    model: string;
    modelLabel: string;
    baseUrl: string | null;
    status: AiProviderRowStatus;
    readOnly: boolean;
    isDefault: boolean;
    description: string;
    keyHint: string | null;
    configured: boolean;
};

type AiProviderResolution = {
    managementMode: 'global_readonly' | 'organization_editable';
};

type OrganizationProviderCapability = {
    enabled: boolean;
};

type AiProvidersPayload = {
    providers: AiProviderRow[];
    defaultProviderId: 'system' | string;
    organizationProviderCapability: OrganizationProviderCapability;
    upgradeTarget: 'enterprise' | 'pro';
    providerResolution: AiProviderResolution;
};

type ProviderFormMode = { type: 'add' } | { type: 'edit'; providerId: string };

type ProviderFormInput = {
    provider: AiProvider;
    model: string;
    baseUrl: string;
    apiKey: string;
};

const ENTERPRISE_INFO_URL = 'https://getdory.dev';
const AI_DOCS_URL = 'https://getdory.dev/en/docs/deploy/environment-variables#ai-variables';

async function parseAppResponse<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.code !== 0 || !payload?.data) {
        throw new Error(payload?.message ?? payload?.error ?? 'Request failed');
    }

    return payload.data as T;
}

async function getAiProviders(): Promise<AiProvidersPayload> {
    const response = await fetch('/api/organization/ai-providers', {
        credentials: 'include',
    });
    return parseAppResponse<AiProvidersPayload>(response);
}

async function createOrganizationProvider(input: ProviderFormInput): Promise<AiProvidersPayload> {
    const response = await fetch('/api/organization/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            provider: input.provider,
            model: input.model,
            baseUrl: input.baseUrl || null,
            apiKey: input.apiKey,
        }),
    });
    return parseAppResponse<AiProvidersPayload>(response);
}

async function patchProvider(providerId: string, body: Record<string, unknown>): Promise<AiProvidersPayload> {
    const response = await fetch(`/api/organization/ai-providers/${encodeURIComponent(providerId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    return parseAppResponse<AiProvidersPayload>(response);
}

async function deleteProvider(providerId: string): Promise<AiProvidersPayload> {
    const response = await fetch(`/api/organization/ai-providers/${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return parseAppResponse<AiProvidersPayload>(response);
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <Label asChild>
                <span>{label}</span>
            </Label>
            {children}
        </div>
    );
}

function ProviderIcon({ provider, label, className }: { provider?: string | null; label?: string | null; className?: string }) {
    const iconSrc = getAiProviderIconSrc(provider);

    if (iconSrc) {
        return (
            <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-sm bg-white', className)}>
                <Image src={iconSrc} alt={label ?? provider ?? 'AI provider'} width={20} height={20} className="max-h-[85%] max-w-[85%] object-contain" />
            </span>
        );
    }

    return (
        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold uppercase text-muted-foreground', className)}>
            {(label ?? provider ?? 'AI').slice(0, 2)}
        </span>
    );
}

function ProviderOptionLabel({ provider, label, iconClassName }: { provider: string; label: string; iconClassName?: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ProviderIcon provider={provider} label={label} className={iconClassName} />
            <span className="truncate">{label}</span>
        </span>
    );
}

function DefaultModelFieldLabel({ label, hint }: { label: string; hint: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>{label}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                        aria-label={hint}
                    >
                        <CircleHelp className="size-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-72">
                    {hint}
                </TooltipContent>
            </Tooltip>
        </span>
    );
}

function normalizeProvider(value: string | null | undefined): AiProvider {
    return isAiProviderAvailable(value as AiProvider) ? (value as AiProvider) : 'openai';
}

function createDefaultForm(): ProviderFormInput {
    return {
        provider: 'openai',
        model: getDefaultAiProviderModel('openai'),
        baseUrl: getDefaultAiProviderBaseUrl('openai'),
        apiKey: '',
    };
}

function ProviderStatusBadge({ row, t }: { row: AiProviderRow; t: ReturnType<typeof useTranslations> }) {
    if (row.isDefault && row.status !== 'unconfigured') {
        return <Badge>{t('Badges.Default')}</Badge>;
    }

    if (row.status === 'unconfigured') {
        return <Badge variant="outline">{t('Badges.Unconfigured')}</Badge>;
    }

    if (row.status === 'disabled') {
        return <Badge variant="outline">{t('Badges.Disabled')}</Badge>;
    }

    return null;
}

export default function AISettingsPageClient() {
    const params = useParams<{ organization: string }>();
    const organizationSlug = params.organization;
    const t = useTranslations('OrganizationSettings.Ai');
    const queryClient = useQueryClient();
    const [formMode, setFormMode] = useState<ProviderFormMode | null>(null);
    const [form, setForm] = useState<ProviderFormInput>(() => createDefaultForm());
    const [providerToDelete, setProviderToDelete] = useState<AiProviderRow | null>(null);

    const providersQuery = useQuery({
        queryKey: ['organization-ai-providers', organizationSlug],
        queryFn: getAiProviders,
        retry: false,
    });

    const providers = providersQuery.data?.providers ?? [];
    const canManageProviders = providersQuery.data?.organizationProviderCapability.enabled === true;
    const organizationProvidersAvailable = providersQuery.data?.providerResolution.managementMode === 'organization_editable';
    const upgradeTarget = providersQuery.data?.upgradeTarget ?? 'enterprise';
    const editingProvider = useMemo(() => {
        if (formMode?.type !== 'edit') return null;
        return providers.find(provider => provider.id === formMode.providerId) ?? null;
    }, [formMode, providers]);
    const formProvider = form.provider;
    const modelIsManual = isAiProviderModelManual(formProvider);
    const modelOptions = getAiProviderModelOptions(formProvider);
    const formProviderLabel = AI_PROVIDER_OPTIONS.find(option => option.value === formProvider)?.label ?? formProvider;
    const baseUrlPlaceholder = getDefaultAiProviderBaseUrl(formProvider) || 'https://api.example.com/v1';
    const formIsSaving = false;

    useEffect(() => {
        if (formMode?.type !== 'edit' || !editingProvider) return;
        const provider = normalizeProvider(editingProvider.provider);
        setForm({
            provider,
            model:
                editingProvider.model && (isAiProviderModelManual(provider) || isAiProviderModelAllowed(provider, editingProvider.model))
                    ? editingProvider.model
                    : getDefaultAiProviderModel(provider),
            baseUrl: editingProvider.baseUrl ?? getDefaultAiProviderBaseUrl(provider),
            apiKey: '',
        });
    }, [editingProvider, formMode]);

    const createMutation = useMutation({
        mutationFn: createOrganizationProvider,
        onSuccess: payload => {
            queryClient.setQueryData(['organization-ai-providers', organizationSlug], payload);
            setFormMode(null);
            setForm(createDefaultForm());
            toast.success(t('Toasts.ProviderAdded'));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.SaveFailed'));
        },
    });

    const patchMutation = useMutation({
        mutationFn: ({ providerId, body }: { providerId: string; body: Record<string, unknown> }) => patchProvider(providerId, body),
        onSuccess: payload => {
            queryClient.setQueryData(['organization-ai-providers', organizationSlug], payload);
            setFormMode(null);
            setForm(createDefaultForm());
            toast.success(t('Toasts.Saved'));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.SaveFailed'));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteProvider,
        onSuccess: payload => {
            queryClient.setQueryData(['organization-ai-providers', organizationSlug], payload);
            setProviderToDelete(null);
            toast.success(t('Toasts.ProviderDeleted'));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.DeleteFailed'));
        },
    });

    const isSaving = createMutation.isPending || patchMutation.isPending || deleteMutation.isPending || formIsSaving;

    function updateProvider(value: AiProvider) {
        setForm({
            provider: value,
            model: getDefaultAiProviderModel(value),
            baseUrl: getDefaultAiProviderBaseUrl(value),
            apiKey: '',
        });
    }

    function openAddForm() {
        setFormMode({ type: 'add' });
        setForm(createDefaultForm());
    }

    function openEditForm(row: AiProviderRow) {
        const provider = normalizeProvider(row.provider);
        setFormMode({ type: 'edit', providerId: row.id });
        setForm({
            provider,
            model: row.model && (isAiProviderModelManual(provider) || isAiProviderModelAllowed(provider, row.model)) ? row.model : getDefaultAiProviderModel(provider),
            baseUrl: row.baseUrl ?? getDefaultAiProviderBaseUrl(provider),
            apiKey: '',
        });
    }

    function saveForm() {
        if (formMode?.type === 'edit' && editingProvider) {
            patchMutation.mutate({
                providerId: editingProvider.id,
                body: {
                    action: 'update',
                    provider: form.provider,
                    model: form.model.trim(),
                    baseUrl: form.baseUrl.trim() || null,
                    apiKey: form.apiKey.trim() || null,
                },
            });
            return;
        }

        createMutation.mutate({
            provider: form.provider,
            model: form.model.trim(),
            baseUrl: form.baseUrl.trim(),
            apiKey: form.apiKey.trim(),
        });
    }

    function setDefault(row: AiProviderRow) {
        patchMutation.mutate({
            providerId: row.id,
            body: { action: 'set_default' },
        });
    }

    async function openEnterpriseInfo() {
        if (window.authBridge?.openExternal) {
            await window.authBridge.openExternal(ENTERPRISE_INFO_URL);
            return;
        }

        window.open(ENTERPRISE_INFO_URL, '_blank', 'noopener,noreferrer');
    }

    async function openDocs() {
        if (window.authBridge?.openExternal) {
            await window.authBridge.openExternal(AI_DOCS_URL);
            return;
        }

        window.open(AI_DOCS_URL, '_blank', 'noopener,noreferrer');
    }

    function openUpgrade() {
        if (upgradeTarget === 'pro') {
            window.location.assign(`/${organizationSlug}/settings/billing`);
            return;
        }

        void openEnterpriseInfo();
    }

    const formTitle = formMode?.type === 'edit' ? t('Form.EditTitle') : t('Form.AddTitle');
    const formDescription = formMode?.type === 'edit' ? t('Form.EditDescription') : t('Form.AddDescription');
    const apiKeyPlaceholder =
        formMode?.type === 'edit' && editingProvider?.keyHint
            ? t('Fields.ApiKeyConfigured', { hint: editingProvider.keyHint })
            : isAiProviderApiKeyRequired(formProvider)
              ? t('Fields.ApiKeyPlaceholder')
              : t('Fields.ApiKeyOptionalPlaceholder');

    return (
        <>
            <div className="space-y-5">
                {providersQuery.isError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {providersQuery.error instanceof Error ? providersQuery.error.message : t('LoadFailed')}
                    </div>
                ) : null}

                {providersQuery.isLoading && !providersQuery.isError ? (
                    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t('Loading')}</div>
                ) : null}

                <section className="rounded-lg border bg-background p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Sparkles className="size-4" />
                            </span>
                            <div>
                                <h2 className="font-semibold">{t('Providers.Title')}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">{t('Providers.Description')}</p>
                            </div>
                        </div>
                        {canManageProviders ? (
                            <Button onClick={openAddForm} disabled={isSaving || Boolean(formMode)}>
                                <Plus className="size-4" />
                                {t('Actions.AddProvider')}
                            </Button>
                        ) : !organizationProvidersAvailable ? (
                            <Button variant="outline" onClick={openUpgrade}>
                                <ExternalLink className="size-4" />
                                {upgradeTarget === 'pro' ? t('Actions.UpgradeToPro') : t('Actions.UpgradeToEnterprise')}
                            </Button>
                        ) : null}
                    </div>

                    {!organizationProvidersAvailable && !providersQuery.isLoading ? (
                        <div className="mt-5 rounded-md border bg-muted/20 px-4 py-3 text-sm">
                            <div className="font-medium">{upgradeTarget === 'pro' ? t('Upgrade.ProTitle') : t('Upgrade.EnterpriseTitle')}</div>
                            <div className="mt-1 text-muted-foreground">{t('Upgrade.Description')}</div>
                        </div>
                    ) : null}

                    {organizationProvidersAvailable && !canManageProviders ? (
                        <div className="mt-5 rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">{t('ReadOnlyHint')}</div>
                    ) : null}

                    <div className="mt-5 space-y-3">
                        {providers.map(row => (
                            <div
                                key={row.id}
                                className={cn(
                                    'rounded-lg border px-4 py-4',
                                    row.isDefault ? 'border-primary/35 bg-primary/5' : row.source === 'system' ? 'border-muted-foreground/20 bg-muted/30' : 'bg-background',
                                )}
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex items-start gap-3">
                                            <span
                                                className={cn(
                                                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border',
                                                    row.isDefault
                                                        ? 'border-primary/35 bg-primary/10 text-primary'
                                                        : row.source === 'system'
                                                          ? 'border-muted-foreground/20 bg-muted text-muted-foreground'
                                                          : 'bg-background',
                                                )}
                                            >
                                                <ProviderIcon provider={row.provider} label={row.providerLabel} className="size-5" />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="min-w-0 font-semibold">{row.displayName}</h3>
                                                    <ProviderStatusBadge row={row} t={t} />
                                                </div>
                                                <div className="mt-1 text-sm text-muted-foreground">
                                                    {row.source === 'system' ? t('SystemProvider.Meta') : t('OrganizationProvider.Meta')}
                                                </div>
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    {row.source === 'system' ? t('SystemProvider.Description') : t('OrganizationProvider.Description')}
                                                </p>
                                                {row.keyHint ? (
                                                    <div className="mt-2 text-xs text-muted-foreground">{t('Fields.ApiKeyConfigured', { hint: row.keyHint })}</div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:justify-end">
                                        {row.source === 'system' ? (
                                            <>
                                                {!row.isDefault && row.configured && canManageProviders ? (
                                                    <Button variant="outline" size="sm" onClick={() => setDefault(row)} disabled={isSaving}>
                                                        <Star className="size-4" />
                                                        {t('Actions.SetAsDefault')}
                                                    </Button>
                                                ) : null}
                                                <Button variant="outline" size="sm" onClick={() => void openDocs()}>
                                                    <BookOpen className="size-4" />
                                                    {t('Actions.View')}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                {!row.isDefault && row.configured ? (
                                                    <Button variant="outline" size="sm" onClick={() => setDefault(row)} disabled={!canManageProviders || isSaving}>
                                                        <Star className="size-4" />
                                                        {t('Actions.SetAsDefault')}
                                                    </Button>
                                                ) : null}
                                                <Button variant="outline" size="sm" onClick={() => openEditForm(row)} disabled={!canManageProviders || isSaving}>
                                                    <Pencil className="size-4" />
                                                    {t('Actions.Edit')}
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setProviderToDelete(row)} disabled={!canManageProviders || isSaving}>
                                                    <Trash2 className="size-4" />
                                                    {t('Actions.Delete')}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <Dialog open={Boolean(formMode)} onOpenChange={open => !open && !isSaving && setFormMode(null)}>
                <DialogContent className="sm:max-w-2xl" onPointerDownOutside={event => isSaving && event.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{formTitle}</DialogTitle>
                        <DialogDescription>{formDescription}</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('Fields.Provider')}>
                            <Select value={form.provider} onValueChange={value => updateProvider(value as AiProvider)} disabled={!canManageProviders || isSaving}>
                                <SelectTrigger className="w-full">
                                    <ProviderOptionLabel provider={form.provider} label={formProviderLabel} />
                                </SelectTrigger>
                                <SelectContent className="z-[70]" position="popper">
                                    {AI_PROVIDER_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value} textValue={option.label}>
                                            <ProviderOptionLabel provider={option.value} label={option.label} />
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label={<DefaultModelFieldLabel label={t('Fields.DefaultModel')} hint={t('Fields.DefaultModelHint')} />}>
                            {modelIsManual ? (
                                <div className="relative">
                                    <ProviderIcon provider={form.provider} label={formProviderLabel} className="absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                                    <Input
                                        value={form.model}
                                        onChange={event => setForm(current => ({ ...current, model: event.target.value }))}
                                        placeholder="gpt-5.4-mini / anthropic/claude-sonnet-4 / your-model-id"
                                        disabled={!canManageProviders || isSaving}
                                        className="pl-9"
                                    />
                                </div>
                            ) : (
                                <Select value={form.model} onValueChange={value => setForm(current => ({ ...current, model: value }))} disabled={!canManageProviders || isSaving}>
                                    <SelectTrigger className="w-full">
                                        <ProviderOptionLabel provider={form.provider} label={modelOptions.find(option => option.value === form.model)?.label ?? form.model} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[70]" position="popper">
                                        {modelOptions.map(option => (
                                            <SelectItem key={option.value} value={option.value} textValue={option.label}>
                                                <ProviderOptionLabel provider={form.provider} label={option.label} />
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </Field>
                        <Field label={t('Fields.BaseUrl')}>
                            <Input
                                value={form.baseUrl}
                                onChange={event => setForm(current => ({ ...current, baseUrl: event.target.value }))}
                                placeholder={baseUrlPlaceholder}
                                disabled={!canManageProviders || isSaving}
                            />
                        </Field>
                        <Field label={t('Fields.ApiKey')}>
                            <Input
                                type="password"
                                value={form.apiKey}
                                onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))}
                                placeholder={apiKeyPlaceholder}
                                disabled={!canManageProviders || isSaving}
                            />
                        </Field>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormMode(null)} disabled={isSaving}>
                            {t('Actions.Cancel')}
                        </Button>
                        <Button onClick={saveForm} disabled={!canManageProviders || isSaving}>
                            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                            {isSaving ? t('Saving') : formMode?.type === 'edit' ? t('Actions.SaveChanges') : t('Actions.AddProvider')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(providerToDelete)} onOpenChange={open => !open && !deleteMutation.isPending && setProviderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DeleteDialog.Title')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DeleteDialog.Description', { provider: providerToDelete?.displayName ?? '' })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>{t('Actions.Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleteMutation.isPending || !providerToDelete}
                            onClick={event => {
                                event.preventDefault();
                                if (!providerToDelete) return;
                                deleteMutation.mutate(providerToDelete.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                            {deleteMutation.isPending ? t('Deleting') : t('Actions.Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
