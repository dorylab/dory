'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bot, CircleCheck, CircleHelp, Cpu, ExternalLink, FlaskConical, KeyRound, Loader2, LockKeyhole, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
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
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import {
    AI_PROVIDER_OPTIONS,
    getAiProviderIconSrc,
    getAiProviderModelOptions,
    getDefaultAiProviderBaseUrl,
    getDefaultAiProviderModel,
    isAiProviderApiKeyRequired,
    isAiProviderAvailable,
    isLocalAiAgentProvider,
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
    canManage: boolean;
    providers: AiProviderRow[];
    defaultProviderId: 'system' | string;
    runtime: string | null;
    organizationProviderCapability: OrganizationProviderCapability;
    upgradeTarget: 'enterprise' | 'pro';
    providerResolution: AiProviderResolution;
    localAiStatus?: LocalAiStatus | null;
};

type LocalAiAgentStatus = {
    id: 'codex-agent' | 'claude-code-agent';
    available: boolean;
    command: string;
    path: string | null;
    version: string | null;
    error: string | null;
};

type LocalAiModelServiceStatus = {
    id: 'ollama' | 'lmstudio';
    available: boolean;
    label: string;
    baseUrl: string;
    error: string | null;
};

type LocalAiBridgeStatus = {
    id: string;
    provider: 'codex-agent' | 'claude-code-agent';
    name: string;
    online: boolean;
    supportsDoryMcpTools: boolean;
    lastSeenAt: string | null;
    createdAt: string | null;
};

type LocalAiStatus = {
    runtime: string | null;
    available: boolean;
    agents: LocalAiAgentStatus[];
    modelServices: LocalAiModelServiceStatus[];
    bridges?: LocalAiBridgeStatus[];
};

type ProviderFormMode = { type: 'add' } | { type: 'edit'; providerId: string };

type ProviderFormInput = {
    provider: AiProvider;
    model: string;
    baseUrl: string;
    apiKey: string;
};

const ENTERPRISE_INFO_URL = 'https://getdory.dev';
const CUSTOM_AI_PROVIDER_OPTIONS = AI_PROVIDER_OPTIONS.filter(option => !isLocalAiAgentProvider(option.value));

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

async function testOrganizationProvider(input: ProviderFormInput): Promise<{ ok: true }> {
    const response = await fetch('/api/organization/ai-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            provider: input.provider,
            model: input.model,
            baseUrl: input.baseUrl || null,
            apiKey: input.apiKey || null,
        }),
    });
    return parseAppResponse<{ ok: true }>(response);
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

function ProviderStatusBadges({ row, t }: { row: AiProviderRow; t: ReturnType<typeof useTranslations> }) {
    return (
        <>
            {row.isDefault && row.status !== 'unconfigured' ? <Badge>{t('Badges.Default')}</Badge> : null}
            {row.status === 'unconfigured' ? (
                <Badge variant="outline" className="text-muted-foreground">
                    {t('Badges.MissingConfig')}
                </Badge>
            ) : null}
            {row.status === 'disabled' ? <Badge variant="outline">{t('Badges.Disabled')}</Badge> : null}
        </>
    );
}

function ProviderStateMessage({ row, t }: { row: AiProviderRow; t: ReturnType<typeof useTranslations> }) {
    if (row.source === 'organization' && row.status === 'unconfigured') {
        return <p className="mt-2 text-sm text-muted-foreground">{t('Status.MissingProviderConfig')}</p>;
    }

    return null;
}

function DefaultAiProviderBadges({ row, ownerLabel, t }: { row: AiProviderRow; ownerLabel: string; t: ReturnType<typeof useTranslations> }) {
    return (
        <>
            <Badge variant="outline">{ownerLabel}</Badge>
            {row.isDefault && row.status !== 'unconfigured' ? <Badge>{t('Badges.Default')}</Badge> : null}
            {row.configured ? (
                <Badge variant="secondary">{t('Badges.Enabled')}</Badge>
            ) : (
                <Badge variant="outline" className="text-muted-foreground">
                    {t('Badges.NotAvailable')}
                </Badge>
            )}
        </>
    );
}

function DefaultAiProviderCard({
    row,
    ownerLabel,
    description,
    unavailableDescription,
    canManageProviders,
    isSaving,
    onSetDefault,
    t,
}: {
    row: AiProviderRow;
    ownerLabel: string;
    description: string;
    unavailableDescription: string;
    canManageProviders: boolean;
    isSaving: boolean;
    onSetDefault: (row: AiProviderRow) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-lg border px-4 py-4 transition-colors',
                row.isDefault ? 'border-primary/25 bg-primary/[0.03]' : 'border-muted-foreground/15 bg-muted/20',
            )}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex items-start gap-3">
                        <span
                            className={cn(
                                'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border',
                                row.isDefault ? 'border-primary/30 bg-background text-primary' : 'border-muted-foreground/15 bg-muted/50 text-muted-foreground',
                            )}
                        >
                            <ProviderIcon provider={row.provider} label={row.providerLabel} className="size-5" />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{row.providerLabel}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <h3 className="min-w-0 font-semibold">{row.modelLabel}</h3>
                                <DefaultAiProviderBadges row={row} ownerLabel={ownerLabel} t={t} />
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{row.configured ? description : unavailableDescription}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                    {!row.isDefault && row.configured && canManageProviders ? (
                        <Button variant="outline" size="sm" onClick={() => onSetDefault(row)} disabled={isSaving}>
                            <CircleCheck className="size-4" />
                            {t('Actions.SetAsDefault')}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function DefaultAiProviderSkeleton() {
    return (
        <div className="rounded-lg border border-muted-foreground/15 bg-muted/20 px-4 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <Skeleton className="mt-0.5 size-9 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1 space-y-3">
                        <Skeleton className="h-4 w-20" />
                        <div className="flex flex-wrap items-center gap-2">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-5 w-24 rounded-full" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-full max-w-xl" />
                    </div>
                </div>
                <Skeleton className="h-8 w-28" />
            </div>
        </div>
    );
}

function DoryAiProviderSection({
    providers,
    canManageProviders,
    isSaving,
    isLoading,
    onSetDefault,
    t,
}: {
    providers: AiProviderRow[];
    canManageProviders: boolean;
    isSaving: boolean;
    isLoading: boolean;
    onSetDefault: (row: AiProviderRow) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Sparkles className="size-4" />
                    </span>
                    <div>
                        <h3 className="font-semibold">{t('DoryAi.Title')}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{t('DoryAi.Description')}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? (
                    <DefaultAiProviderSkeleton />
                ) : (
                    providers.map(row => (
                        <DefaultAiProviderCard
                            key={row.id}
                            row={row}
                            ownerLabel={t('Badges.DoryProvided')}
                            description={row.isDefault ? t('DoryAi.ActiveModelDescription') : t('DoryAi.ModelDescription')}
                            unavailableDescription={t('DoryAi.UnavailableDescription')}
                            canManageProviders={canManageProviders}
                            isSaving={isSaving}
                            onSetDefault={onSetDefault}
                            t={t}
                        />
                    ))
                )}
            </div>
        </section>
    );
}

function AdminProvidedAiProviderSection({
    providers,
    canManageProviders,
    isSaving,
    isLoading,
    onSetDefault,
    t,
}: {
    providers: AiProviderRow[];
    canManageProviders: boolean;
    isSaving: boolean;
    isLoading: boolean;
    onSetDefault: (row: AiProviderRow) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <KeyRound className="size-4" />
                    </span>
                    <div>
                        <h3 className="font-semibold">{t('AdminAi.Title')}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{t('AdminAi.Description')}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? (
                    <DefaultAiProviderSkeleton />
                ) : (
                    providers.map(row => (
                        <DefaultAiProviderCard
                            key={row.id}
                            row={row}
                            ownerLabel={t('Badges.AdminProvided')}
                            description={row.isDefault ? t('AdminAi.ActiveModelDescription') : t('AdminAi.ModelDescription')}
                            unavailableDescription={t('AdminAi.UnavailableDescription')}
                            canManageProviders={canManageProviders}
                            isSaving={isSaving}
                            onSetDefault={onSetDefault}
                            t={t}
                        />
                    ))
                )}
            </div>
        </section>
    );
}

function LocalAgentCard({
    agent,
    row,
    bridge,
    grouped = false,
    isDesktopRuntime,
    canManageProviders,
    isSaving,
    onEnable,
    onOpenSetup,
    onSetDefault,
    onDelete,
    t,
}: {
    agent: LocalAiAgentStatus;
    row?: AiProviderRow | null;
    bridge?: LocalAiBridgeStatus | null;
    grouped?: boolean;
    isDesktopRuntime: boolean;
    canManageProviders: boolean;
    isSaving: boolean;
    onEnable: (agent: LocalAiAgentStatus) => void;
    onOpenSetup: (agent: LocalAiAgentStatus) => void;
    onSetDefault: (row: AiProviderRow) => void;
    onDelete: (row: AiProviderRow) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    const title = agent.id === 'codex-agent' ? 'Codex Agent' : 'Claude Code';
    const actionLabel =
        !isDesktopRuntime && agent.id === 'codex-agent' && !bridge?.online
            ? t('LocalAi.ConnectCodex')
            : agent.id === 'codex-agent'
              ? t('LocalAi.EnableCodex')
              : t('LocalAi.EnableClaudeCode');
    const active = Boolean(row?.isDefault);
    const bridgeNeedsUpdate = !isDesktopRuntime && agent.id === 'codex-agent' && Boolean(bridge?.online) && bridge?.supportsDoryMcpTools !== true;
    const configured = Boolean(row) && (isDesktopRuntime ? agent.available : Boolean(bridge?.online));
    const detected = isDesktopRuntime ? agent.available : Boolean(bridge?.online);
    const ready = detected && !bridgeNeedsUpdate;

    return (
        <div
            className={cn(
                grouped ? 'px-4 py-4 transition-colors' : 'rounded-lg border px-4 py-4 transition-colors',
                active ? (grouped ? 'bg-primary/[0.03]' : 'border-primary/25 bg-primary/[0.03]') : 'bg-background',
            )}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span
                        className={cn(
                            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border',
                            active ? 'border-primary/30 bg-background text-primary' : 'bg-background',
                        )}
                    >
                        <ProviderIcon provider={agent.id} label={title} className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 font-semibold">{title}</h3>
                            {active ? <Badge>{t('Badges.Default')}</Badge> : null}
                            {configured ? <Badge variant="secondary">{t('Badges.Enabled')}</Badge> : null}
                            {!detected ? (
                                <Badge variant="outline" className="text-muted-foreground">
                                    {t('LocalAi.NotDetected')}
                                </Badge>
                            ) : null}
                            {bridgeNeedsUpdate ? <Badge variant="outline">{t('LocalAi.BridgeNeedsUpdate')}</Badge> : null}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {isDesktopRuntime
                                ? agent.available
                                    ? t('LocalAi.AgentDetectedDescription', { command: agent.command })
                                    : t('LocalAi.AgentMissingDescription', { command: agent.command })
                                : bridgeNeedsUpdate
                                  ? t('LocalAi.BridgeNeedsUpdateDescription')
                                  : bridge?.online
                                    ? t('LocalAi.BridgeDetectedDescription', { name: bridge.name })
                                    : t('LocalAi.BridgeMissingDescription')}
                        </p>
                        {agent.version ? <div className="mt-2 text-xs text-muted-foreground">{agent.version}</div> : null}
                        {!isDesktopRuntime && bridge?.lastSeenAt ? (
                            <div className="mt-2 text-xs text-muted-foreground">{t('LocalAi.LastSeen', { time: bridge.lastSeenAt })}</div>
                        ) : null}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                    {row && !row.isDefault ? (
                        <Button variant="outline" size="sm" onClick={() => onSetDefault(row)} disabled={!canManageProviders || isSaving || !ready}>
                            <CircleCheck className="size-4" />
                            {t('Actions.SetAsDefault')}
                        </Button>
                    ) : null}
                    {row ? (
                        <Button variant="ghost" size="icon" onClick={() => onDelete(row)} disabled={!canManageProviders || isSaving} aria-label={t('Actions.Delete')}>
                            <Trash2 className="size-4" />
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => (ready ? onEnable(agent) : onOpenSetup(agent))}
                            disabled={!canManageProviders || isSaving || (!isDesktopRuntime && agent.id !== 'codex-agent')}
                        >
                            <Plus className="size-4" />
                            {actionLabel}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function LocalModelServiceCard({
    service,
    grouped = false,
    canManageProviders,
    isSaving,
    onConnect,
    t,
}: {
    service: LocalAiModelServiceStatus;
    grouped?: boolean;
    canManageProviders: boolean;
    isSaving: boolean;
    onConnect: (service: LocalAiModelServiceStatus) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    return (
        <div className={cn(grouped ? 'bg-background px-4 py-4' : 'rounded-lg border bg-background px-4 py-4')}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                        <Cpu className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 font-semibold">{service.label}</h3>
                            {service.available ? <Badge variant="secondary">{t('LocalAi.Running')}</Badge> : <Badge variant="outline">{t('LocalAi.NotRunning')}</Badge>}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{t('LocalAi.ModelServiceDescription', { endpoint: service.baseUrl })}</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => onConnect(service)} disabled={!canManageProviders || isSaving || !service.available}>
                    <Plus className="size-4" />
                    {t('LocalAi.ConnectLocalModel')}
                </Button>
            </div>
        </div>
    );
}

function LocalAiProviderSection({
    localAiStatus,
    localAgentProviders,
    isDesktopRuntime,
    canManageProviders,
    canManageModelServices,
    isSaving,
    onEnableAgent,
    onOpenSetup,
    onSetDefault,
    onDelete,
    onConnectModelService,
    t,
}: {
    localAiStatus: LocalAiStatus | null | undefined;
    localAgentProviders: AiProviderRow[];
    isDesktopRuntime: boolean;
    canManageProviders: boolean;
    canManageModelServices: boolean;
    isSaving: boolean;
    onEnableAgent: (agent: LocalAiAgentStatus) => void;
    onOpenSetup: (agent: LocalAiAgentStatus) => void;
    onSetDefault: (row: AiProviderRow) => void;
    onDelete: (row: AiProviderRow) => void;
    onConnectModelService: (service: LocalAiModelServiceStatus) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    const status = localAiStatus ?? null;
    const agents = status?.agents ?? [
        { id: 'codex-agent' as const, available: false, command: 'codex', path: null, version: null, error: null },
        { id: 'claude-code-agent' as const, available: false, command: 'claude', path: null, version: null, error: null },
    ];
    const modelServices = status?.modelServices ?? [
        { id: 'ollama' as const, available: false, label: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', error: null },
        { id: 'lmstudio' as const, available: false, label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', error: null },
    ];
    const bridges = status?.bridges ?? [];
    const codexAgent = agents.find(agent => agent.id === 'codex-agent') ?? agents[0];
    const codexBridge = bridges.find(bridge => bridge.provider === 'codex-agent' && bridge.online) ?? bridges.find(bridge => bridge.provider === 'codex-agent') ?? null;
    const hasLocalAgentDefault = localAgentProviders.some(provider => provider.isDefault);
    const hasLocalAgentEnabled = localAgentProviders.some(provider => provider.configured);
    const codexBridgeNeedsUpdate = !isDesktopRuntime && Boolean(codexBridge?.online) && codexBridge?.supportsDoryMcpTools !== true;
    const usageHint = hasLocalAgentDefault
        ? t('LocalAi.UsageDefaultHint')
        : hasLocalAgentEnabled
          ? t('LocalAi.UsageEnabledHint')
          : isDesktopRuntime
            ? t('LocalAi.UsageDesktopHint')
            : codexBridge?.online && !codexBridgeNeedsUpdate
              ? t('LocalAi.UsageBridgeReadyHint')
              : t('LocalAi.UsageSetupHint');

    return (
        <section className="space-y-3">
            <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Bot className="size-4" />
                </span>
                <div>
                    <h3 className="font-semibold">{t('LocalAi.Title')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{status?.available ? t('LocalAi.Description') : t('LocalAi.DesktopOnlyDescription')}</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background">
                <Alert className="items-center rounded-none border-0 bg-muted/30 [&>svg]:translate-y-0">
                    <CircleHelp className="size-4 self-center" />
                    <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span>{usageHint}</span>
                        {!isDesktopRuntime && codexAgent ? (
                            <Button variant="outline" size="sm" onClick={() => onOpenSetup(codexAgent)} className="w-full shrink-0 sm:w-auto">
                                {t('LocalAi.ViewSetup')}
                            </Button>
                        ) : null}
                    </AlertDescription>
                </Alert>

                <div className="divide-y">
                    {agents.map(agent => (
                        <LocalAgentCard
                            key={agent.id}
                            agent={agent}
                            row={localAgentProviders.find(provider => provider.provider === agent.id)}
                            bridge={bridges.find(bridge => bridge.provider === agent.id && bridge.online) ?? bridges.find(bridge => bridge.provider === agent.id) ?? null}
                            grouped
                            isDesktopRuntime={isDesktopRuntime}
                            canManageProviders={canManageProviders && (isDesktopRuntime ? Boolean(status?.available) : true)}
                            isSaving={isSaving}
                            onEnable={onEnableAgent}
                            onOpenSetup={onOpenSetup}
                            onSetDefault={onSetDefault}
                            onDelete={onDelete}
                            t={t}
                        />
                    ))}
                    {modelServices.map(service => (
                        <LocalModelServiceCard
                            key={service.id}
                            service={service}
                            grouped
                            canManageProviders={canManageModelServices && Boolean(status?.available)}
                            isSaving={isSaving}
                            onConnect={onConnectModelService}
                            t={t}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

export type AISettingsPageClientProps = {
    initialRuntime?: string | null;
    onOpenBillingSettings?: () => void;
};

export default function AISettingsPageClient({ initialRuntime = null, onOpenBillingSettings }: AISettingsPageClientProps) {
    const params = useParams<{ organization: string }>();
    const organizationSlug = params.organization;
    const t = useTranslations('OrganizationSettings.Ai');
    const queryClient = useQueryClient();
    const providersQueryKey = useMemo(() => ['organization-ai-providers', organizationSlug] as const, [organizationSlug]);
    const [formMode, setFormMode] = useState<ProviderFormMode | null>(null);
    const [form, setForm] = useState<ProviderFormInput>(() => createDefaultForm());
    const [providerToDelete, setProviderToDelete] = useState<AiProviderRow | null>(null);
    const [localAgentActionId, setLocalAgentActionId] = useState<string | null>(null);
    const [localAiSetupAgent, setLocalAiSetupAgent] = useState<LocalAiAgentStatus | null>(null);

    const providersQuery = useQuery({
        queryKey: providersQueryKey,
        queryFn: getAiProviders,
        retry: false,
    });

    const providers = useMemo(() => providersQuery.data?.providers ?? [], [providersQuery.data?.providers]);
    const canManageAiSettings = providersQuery.data?.canManage === true;
    const canManageProviders = canManageAiSettings && providersQuery.data?.organizationProviderCapability?.enabled === true;
    const organizationProvidersAvailable = providersQuery.data?.providerResolution?.managementMode === 'organization_editable';
    const upgradeTarget = providersQuery.data?.upgradeTarget ?? 'enterprise';
    const resolvedRuntime = providersQuery.data?.runtime ?? initialRuntime;
    const isDesktopRuntime = resolvedRuntime === 'desktop';
    const systemProviders = providers.filter(provider => provider.source === 'system');
    const organizationProviders = providers.filter(provider => provider.source === 'organization');
    const localAgentProviders = organizationProviders.filter(provider => isLocalAiAgentProvider(provider.provider));
    const customOrganizationProviders = organizationProviders.filter(provider => !isLocalAiAgentProvider(provider.provider));
    const localAiStatus = providersQuery.data?.localAiStatus ?? null;
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
            queryClient.setQueryData(providersQueryKey, payload);
            setFormMode(null);
            setForm(createDefaultForm());
            toast.success(t('Toasts.ProviderAdded'));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.SaveFailed'));
        },
    });

    const testMutation = useMutation({
        mutationFn: testOrganizationProvider,
        onSuccess: () => {
            toast.success(t('Toasts.TestSucceeded'));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.TestFailed'));
        },
    });

    const patchMutation = useMutation({
        mutationFn: ({ providerId, body }: { providerId: string; body: Record<string, unknown> }) => patchProvider(providerId, body),
        onMutate: async variables => {
            if (variables.body.action !== 'set_default') return;

            await queryClient.cancelQueries({ queryKey: providersQueryKey });
            const previousPayload = queryClient.getQueryData<AiProvidersPayload>(providersQueryKey);

            queryClient.setQueryData<AiProvidersPayload>(providersQueryKey, current => {
                if (!current) return current;

                const providers = current.providers
                    .map(provider => {
                        const isDefault = provider.id === variables.providerId;
                        if (isDefault) {
                            return {
                                ...provider,
                                isDefault: true,
                                status: provider.configured ? 'active' : provider.status,
                            } satisfies AiProviderRow;
                        }

                        return {
                            ...provider,
                            isDefault: false,
                            status: provider.status === 'active' ? 'enabled' : provider.status,
                        } satisfies AiProviderRow;
                    })
                    .sort((left, right) => {
                        if (left.id === variables.providerId) return -1;
                        if (right.id === variables.providerId) return 1;
                        return 0;
                    });

                return {
                    ...current,
                    providers,
                    defaultProviderId: variables.providerId,
                };
            });

            return { previousPayload };
        },
        onSuccess: (payload, variables) => {
            queryClient.setQueryData(providersQueryKey, payload);
            void queryClient.invalidateQueries({ queryKey: providersQueryKey });
            setFormMode(null);
            setForm(createDefaultForm());
            toast.success(variables.body.action === 'set_default' ? t('Toasts.DefaultUpdated') : t('Toasts.Saved'));
        },
        onError: (error, _variables, context) => {
            if (context?.previousPayload) {
                queryClient.setQueryData(providersQueryKey, context.previousPayload);
            }
            toast.error(error instanceof Error ? error.message : t('Toasts.SaveFailed'));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteProvider,
        onSuccess: payload => {
            queryClient.setQueryData(providersQueryKey, payload);
            setProviderToDelete(null);
            toast.success(t('Toasts.ProviderDeleted'));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.DeleteFailed'));
        },
    });

    const isSaving = createMutation.isPending || patchMutation.isPending || deleteMutation.isPending || Boolean(localAgentActionId) || formIsSaving;
    const isTestingProvider = testMutation.isPending;
    const isFormBusy = isSaving || isTestingProvider;

    function updateProvider(value: AiProvider) {
        setForm({
            provider: value,
            model: getDefaultAiProviderModel(value),
            baseUrl: getDefaultAiProviderBaseUrl(value),
            apiKey: '',
        });
    }

    async function enableLocalAgent(agent: LocalAiAgentStatus) {
        if (!isLocalAiAgentProvider(agent.id)) return;
        const bridge = localAiStatus?.bridges?.find(candidate => candidate.provider === agent.id && candidate.online) ?? null;
        const baseUrl = isDesktopRuntime ? '' : bridge ? `bridge:${bridge.id}` : '';
        if (!isDesktopRuntime && (!bridge || (agent.id === 'codex-agent' && bridge.supportsDoryMcpTools !== true))) {
            setLocalAiSetupAgent(agent);
            return;
        }

        setLocalAgentActionId(agent.id);
        try {
            const createdPayload = await createOrganizationProvider({
                provider: agent.id,
                model: 'default',
                baseUrl,
                apiKey: '',
            });
            const createdProvider = createdPayload.providers.find(provider => provider.source === 'organization' && provider.provider === agent.id);
            const nextPayload = createdProvider ? await patchProvider(createdProvider.id, { action: 'set_default' }) : createdPayload;
            queryClient.setQueryData(providersQueryKey, nextPayload);
            void queryClient.invalidateQueries({ queryKey: providersQueryKey });
            toast.success(t('Toasts.ProviderAdded'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('Toasts.SaveFailed'));
        } finally {
            setLocalAgentActionId(null);
        }
    }

    function openAddForm(input?: Partial<ProviderFormInput>) {
        setFormMode({ type: 'add' });
        setForm({
            ...createDefaultForm(),
            ...input,
        });
    }

    function openLocalModelForm(service: LocalAiModelServiceStatus) {
        openAddForm({
            provider: 'openai-compatible',
            model: service.id === 'ollama' ? 'llama3.1' : 'local-model',
            baseUrl: service.baseUrl,
            apiKey: '',
        });
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

    function testForm() {
        testMutation.mutate({
            provider: form.provider,
            model: form.model.trim(),
            baseUrl: form.baseUrl.trim(),
            apiKey: form.apiKey.trim(),
        });
    }

    function setDefault(row: AiProviderRow) {
        if (!isDesktopRuntime && isLocalAiAgentProvider(row.provider) && !row.baseUrl?.startsWith('bridge:')) {
            const bridge =
                localAiStatus?.bridges?.find(
                    candidate => candidate.provider === row.provider && candidate.online && (row.provider !== 'codex-agent' || candidate.supportsDoryMcpTools === true),
                ) ?? null;
            if (!bridge) {
                setLocalAiSetupAgent({
                    id: row.provider,
                    available: false,
                    command: row.provider === 'codex-agent' ? 'codex' : 'claude',
                    path: null,
                    version: null,
                    error: null,
                });
                return;
            }

            setLocalAgentActionId(row.provider);
            void (async () => {
                try {
                    await patchProvider(row.id, {
                        action: 'update',
                        provider: row.provider,
                        model: row.model || 'default',
                        baseUrl: `bridge:${bridge.id}`,
                        apiKey: null,
                    });
                    const nextPayload = await patchProvider(row.id, { action: 'set_default' });
                    queryClient.setQueryData(providersQueryKey, nextPayload);
                    void queryClient.invalidateQueries({ queryKey: providersQueryKey });
                    toast.success(t('Toasts.DefaultUpdated'));
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : t('Toasts.SaveFailed'));
                } finally {
                    setLocalAgentActionId(null);
                }
            })();
            return;
        }

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

    function openUpgrade() {
        if (upgradeTarget === 'pro') {
            if (onOpenBillingSettings) {
                onOpenBillingSettings();
                return;
            }
            window.location.assign(`/${organizationSlug}/settings/billing`);
            return;
        }

        void openEnterpriseInfo();
    }

    const formTitle = formMode?.type === 'edit' ? t('Form.EditTitle') : t('Form.AddTitle');
    const formDescription = formMode?.type === 'edit' ? t('Form.EditDescription') : t('Form.AddDescription');
    const apiKeyStorageDescription = isDesktopRuntime ? t('Form.ApiKeyStorageDesktop') : t('Form.ApiKeyStorageInstance');
    const apiKeyPlaceholder =
        formMode?.type === 'edit' && editingProvider?.keyHint
            ? t('Fields.ApiKeyConfigured', { hint: editingProvider.keyHint })
            : isAiProviderApiKeyRequired(formProvider)
              ? t('Fields.ApiKeyPlaceholder')
              : t('Fields.ApiKeyOptionalPlaceholder');
    const upgradeActionLabel = upgradeTarget === 'pro' ? t('Actions.UpgradeToPro') : t('Actions.UpgradeToEnterprise');
    const doryOrigin = typeof window === 'undefined' ? '' : window.location.origin;
    const localAiBridgeCommand = `npx -y @getdory/cli agent codex --url ${doryOrigin}`;

    function renderProviderRow(row: AiProviderRow) {
        const providerDescription = row.source === 'organization' && row.isDefault ? t('OrganizationProvider.ActiveDescription') : t('OrganizationProvider.Description');

        return (
            <div
                key={row.id}
                className={cn('relative overflow-hidden rounded-lg border px-4 py-4 transition-colors', row.isDefault ? 'border-primary/25 bg-primary/[0.03]' : 'bg-background')}
            >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-start gap-3">
                            <span
                                className={cn(
                                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border',
                                    row.isDefault ? 'border-primary/30 bg-background text-primary' : 'bg-background',
                                )}
                            >
                                <ProviderIcon provider={row.provider} label={row.providerLabel} className="size-5" />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="min-w-0 font-semibold">{row.displayName}</h3>
                                    <ProviderStatusBadges row={row} t={t} />
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{providerDescription}</p>
                                <ProviderStateMessage row={row} t={t} />
                                {row.keyHint ? <div className="mt-2 text-xs text-muted-foreground">{t('Fields.ApiKeyConfigured', { hint: row.keyHint })}</div> : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        {!row.isDefault && row.configured ? (
                            <Button variant="outline" size="sm" onClick={() => setDefault(row)} disabled={!canManageProviders || isSaving}>
                                <CircleCheck className="size-4" />
                                {t('Actions.SetAsDefault')}
                            </Button>
                        ) : null}
                        <Button variant="ghost" size="icon" onClick={() => openEditForm(row)} disabled={!canManageProviders || isSaving} aria-label={t('Actions.Edit')}>
                            <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setProviderToDelete(row)} disabled={!canManageProviders || isSaving} aria-label={t('Actions.Delete')}>
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-5">
                {providersQuery.isError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {providersQuery.error instanceof Error ? providersQuery.error.message : t('LoadFailed')}
                    </div>
                ) : null}

                {isDesktopRuntime ? (
                    <DoryAiProviderSection
                        providers={systemProviders}
                        canManageProviders={canManageAiSettings}
                        isSaving={isSaving}
                        isLoading={providersQuery.isLoading}
                        onSetDefault={setDefault}
                        t={t}
                    />
                ) : (
                    <AdminProvidedAiProviderSection
                        providers={systemProviders}
                        canManageProviders={canManageAiSettings}
                        isSaving={isSaving}
                        isLoading={providersQuery.isLoading}
                        onSetDefault={setDefault}
                        t={t}
                    />
                )}

                <LocalAiProviderSection
                    localAiStatus={localAiStatus}
                    localAgentProviders={localAgentProviders}
                    isDesktopRuntime={isDesktopRuntime}
                    canManageProviders={canManageAiSettings}
                    canManageModelServices={canManageProviders}
                    isSaving={isSaving}
                    onEnableAgent={agent => void enableLocalAgent(agent)}
                    onOpenSetup={setLocalAiSetupAgent}
                    onSetDefault={setDefault}
                    onDelete={setProviderToDelete}
                    onConnectModelService={openLocalModelForm}
                    t={t}
                />

                <section className="space-y-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <KeyRound className="size-4" />
                            </span>
                            <div>
                                <h3 className="font-semibold">{t('Groups.OrganizationTitle')}</h3>
                                <p className="mt-1 text-sm text-muted-foreground">{t('Groups.OrganizationDescription')}</p>
                            </div>
                        </div>
                        {canManageProviders ? (
                            <Button size="sm" onClick={() => openAddForm()} disabled={isSaving || Boolean(formMode)}>
                                <Plus className="size-4" />
                                {t('Actions.AddProvider')}
                            </Button>
                        ) : null}
                    </div>

                    {organizationProvidersAvailable && !canManageProviders ? (
                        <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">{t('ReadOnlyHint')}</div>
                    ) : null}

                    {providersQuery.isLoading ? (
                        <DefaultAiProviderSkeleton />
                    ) : !organizationProvidersAvailable ? (
                        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                                        <LockKeyhole className="size-4" />
                                    </span>
                                    <div>
                                        <div className="text-sm font-medium">
                                            {upgradeTarget === 'pro' ? t('Groups.OrganizationLockedProTitle') : t('Groups.OrganizationLockedEnterpriseTitle')}
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">{t('Groups.OrganizationLockedDescription')}</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={openUpgrade} className="w-full sm:w-auto">
                                    <ExternalLink className="size-4" />
                                    {upgradeActionLabel}
                                </Button>
                            </div>
                        </div>
                    ) : customOrganizationProviders.length > 0 ? (
                        <div className="space-y-3">{customOrganizationProviders.map(renderProviderRow)}</div>
                    ) : (
                        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5">
                            <div className="text-sm font-medium">{t('Groups.OrganizationEmptyTitle')}</div>
                            <p className="mt-1 text-sm text-muted-foreground">{t('Groups.OrganizationEmptyDescription')}</p>
                        </div>
                    )}
                </section>
            </div>

            <Dialog open={Boolean(formMode)} onOpenChange={open => !open && !isFormBusy && setFormMode(null)}>
                <DialogContent className="sm:max-w-2xl" onPointerDownOutside={event => isFormBusy && event.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{formTitle}</DialogTitle>
                        <DialogDescription>{formDescription}</DialogDescription>
                    </DialogHeader>

                    <Alert className="border-primary/20 bg-primary/10 text-primary">
                        <KeyRound className="size-4" />
                        <AlertDescription className="text-primary/80">{apiKeyStorageDescription}</AlertDescription>
                    </Alert>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('Fields.Provider')}>
                            <Select value={form.provider} onValueChange={value => updateProvider(value as AiProvider)} disabled={!canManageProviders || isFormBusy}>
                                <SelectTrigger className="w-full">
                                    <ProviderOptionLabel provider={form.provider} label={formProviderLabel} />
                                </SelectTrigger>
                                <SelectContent className="z-[70]" position="popper">
                                    {CUSTOM_AI_PROVIDER_OPTIONS.map(option => (
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
                                        disabled={!canManageProviders || isFormBusy}
                                        className="pl-9"
                                    />
                                </div>
                            ) : (
                                <Select value={form.model} onValueChange={value => setForm(current => ({ ...current, model: value }))} disabled={!canManageProviders || isFormBusy}>
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
                                disabled={!canManageProviders || isFormBusy}
                            />
                        </Field>
                        <Field label={t('Fields.ApiKey')}>
                            <Input
                                type="password"
                                value={form.apiKey}
                                onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))}
                                placeholder={apiKeyPlaceholder}
                                disabled={!canManageProviders || isFormBusy}
                            />
                        </Field>
                    </div>

                    <DialogFooter className="sm:justify-between">
                        <Button variant="outline" onClick={testForm} disabled={!canManageProviders || isFormBusy}>
                            {isTestingProvider ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                            {isTestingProvider ? t('Testing') : t('Actions.TestProvider')}
                        </Button>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button variant="outline" onClick={() => setFormMode(null)} disabled={isFormBusy}>
                                {t('Actions.Cancel')}
                            </Button>
                            <Button onClick={saveForm} disabled={!canManageProviders || isFormBusy}>
                                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                                {isSaving ? t('Saving') : formMode?.type === 'edit' ? t('Actions.SaveChanges') : t('Actions.AddProvider')}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(localAiSetupAgent)} onOpenChange={open => !open && setLocalAiSetupAgent(null)}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('LocalAi.SetupTitle')}</DialogTitle>
                        <DialogDescription>{t('LocalAi.SetupDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('LocalAi.BridgeCommand')}</Label>
                            <pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 text-sm">
                                <code>{localAiBridgeCommand}</code>
                            </pre>
                        </div>
                        <p className="text-sm text-muted-foreground">{t('LocalAi.SetupRefreshHint')}</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: providersQueryKey })}>
                            {t('Actions.Refresh')}
                        </Button>
                        <Button onClick={() => setLocalAiSetupAgent(null)}>{t('Actions.Done')}</Button>
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
