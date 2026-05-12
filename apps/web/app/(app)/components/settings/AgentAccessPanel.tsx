'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { authFetch } from '@/lib/client/auth-fetch';
import { SettingsRow } from './SettingsRow';

type McpTokenRecord = {
    id: string;
    name: string;
    tokenPrefix: string;
    scopes: string[];
    enabled: boolean;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
};

type McpSettingsPayload = {
    endpoint: string;
    defaultScopes: string[];
    tokens: McpTokenRecord[];
};

const TOKEN_PLACEHOLDER = 'dory_mcp_...';
const TOKEN_ENV_VAR = 'DORY_MCP_TOKEN';

function formatDate(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

async function readJson<T>(res: Response): Promise<T> {
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.code !== 0) {
        throw new Error(json?.message ?? 'Request failed');
    }
    return json.data as T;
}

export function AgentAccessPanel() {
    const t = useTranslations('DoryUI.Settings.AgentAccess');
    const [settings, setSettings] = useState<McpSettingsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [tokenName, setTokenName] = useState('MCP Client');
    const [newToken, setNewToken] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const setupSnippets = useMemo(() => {
        if (!settings?.endpoint) return '';
        const authorizationHeader = `Bearer ${TOKEN_PLACEHOLDER}`;
        const genericJson = JSON.stringify(
            {
                mcpServers: {
                    dory: {
                        type: 'http',
                        url: settings.endpoint,
                        headers: {
                            Authorization: authorizationHeader,
                        },
                    },
                },
            },
            null,
            2,
        );
        const codexCli = [
            `export ${TOKEN_ENV_VAR}="${TOKEN_PLACEHOLDER}"`,
            `codex mcp add dory --url ${settings.endpoint} --bearer-token-env-var ${TOKEN_ENV_VAR}`,
            'codex mcp list',
        ].join('\n');
        const codexToml = [`[mcp_servers.dory]`, `url = "${settings.endpoint}"`, `bearer_token_env_var = "${TOKEN_ENV_VAR}"`].join('\n');
        const claudeCli = [`claude mcp add --transport http dory ${settings.endpoint} \\`, `  --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`, 'claude mcp list'].join('\n');
        const claudeJson = JSON.stringify(
            {
                mcpServers: {
                    dory: {
                        type: 'http',
                        url: settings.endpoint,
                        headers: {
                            Authorization: `Bearer \${${TOKEN_ENV_VAR}}`,
                        },
                    },
                },
            },
            null,
            2,
        );
        return {
            endpoint: settings.endpoint,
            genericJson,
            codexCli,
            codexToml,
            claudeCli,
            claudeJson,
            authorizationHeader,
        };
    }, [settings?.endpoint]);

    const loadSettings = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const payload = await readJson<McpSettingsPayload>(await authFetch('/api/mcp/settings'));
            setSettings(payload);
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('LoadFailed') });
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    const createToken = async () => {
        setCreating(true);
        setMessage(null);
        setNewToken(null);
        try {
            const payload = await readJson<{ token: string; record: McpTokenRecord }>(
                await authFetch('/api/mcp/tokens', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: tokenName.trim() || 'MCP Client' }),
                }),
            );
            setNewToken(payload.token);
            setSettings(current => (current ? { ...current, tokens: [...current.tokens, payload.record] } : current));
            setMessage({ type: 'success', text: t('TokenCreated') });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('CreateFailed') });
        } finally {
            setCreating(false);
        }
    };

    const deleteToken = async (id: string) => {
        setMessage(null);
        try {
            await readJson<{ deleted: boolean }>(
                await authFetch(`/api/mcp/tokens/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                }),
            );
            setSettings(current =>
                current
                    ? {
                          ...current,
                          tokens: current.tokens.filter(token => token.id !== id),
                      }
                    : current,
            );
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('RevokeFailed') });
        }
    };

    const copyLabel = (
        <>
            <Copy className="h-3.5 w-3.5" />
        </>
    );

    const copiedLabel = (
        <>
            <Check className="h-3.5 w-3.5" />
        </>
    );
    const isInitialLoading = loading && !settings;

    return (
        <div className="space-y-6">
            <div className="space-y-1.5">
                <SettingsRow label={t('EndpointLabel')} description={t('EndpointDescription')}>
                    <CopyButton
                        text={settings?.endpoint ?? ''}
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!settings?.endpoint}
                        aria-label={t('Copy')}
                        title={t('Copy')}
                        label={copyLabel}
                        copiedLabel={copiedLabel}
                    />
                </SettingsRow>
                {isInitialLoading ? (
                    <Skeleton className="h-9 w-full" />
                ) : settings?.endpoint ? (
                    <pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{settings.endpoint}</pre>
                ) : null}
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{t('TokensTitle')}</div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadSettings} disabled={loading} aria-label={t('Refresh')} title={t('Refresh')}>
                        <RotateCcw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                    </Button>
                </div>
                <div className="flex gap-2">
                    <Input value={tokenName} onChange={event => setTokenName(event.target.value)} placeholder={t('TokenNamePlaceholder')} disabled={!settings} />
                    <Button size="sm" onClick={createToken} disabled={creating || !settings}>
                        {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        {t('CreateToken')}
                    </Button>
                </div>
                {newToken ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                        <div className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">{t('TokenOnce')}</div>
                        <div className="flex items-center gap-2">
                            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">{newToken}</code>
                            <CopyButton
                                text={newToken}
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={t('Copy')}
                                title={t('Copy')}
                                label={copyLabel}
                                copiedLabel={copiedLabel}
                            />
                        </div>
                    </div>
                ) : null}
                <div className="divide-y rounded-md border">
                    {isInitialLoading ? (
                        <>
                            <TokenSkeleton />
                            <TokenSkeleton />
                        </>
                    ) : (settings?.tokens ?? []).length === 0 ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground">{t('NoTokens')}</div>
                    ) : (
                        settings!.tokens.map(token => (
                            <div key={token.id} className="flex items-center justify-between gap-3 px-3 py-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                        {token.name} <span className="font-mono text-xs text-muted-foreground">{token.tokenPrefix}...</span>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {token.revokedAt ? t('RevokedAt', { date: formatDate(token.revokedAt) }) : t('LastUsedAt', { date: formatDate(token.lastUsedAt) })}
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => deleteToken(token.id)}
                                    aria-label={t('DeleteToken')}
                                    title={t('DeleteToken')}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {isInitialLoading ? (
                <div className="space-y-3">
                    <div>
                        <div className="text-sm font-medium">{t('SetupTitle')}</div>
                        <div className="mt-2">
                            <Skeleton className="h-4 w-72" />
                        </div>
                    </div>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
            ) : setupSnippets ? (
                <div className="space-y-3">
                    <div>
                        <div className="text-sm font-medium">{t('SetupTitle')}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{t('SetupDescription')}</div>
                    </div>
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="general">{t('SetupTabs.General')}</TabsTrigger>
                            <TabsTrigger value="codex">Codex</TabsTrigger>
                            <TabsTrigger value="claudeCode">Claude Code</TabsTrigger>
                        </TabsList>
                        <TabsContent value="general" className="mt-3 space-y-3">
                            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs">
                                <div className="grid gap-1">
                                    <span className="font-medium text-foreground">{t('General.Endpoint')}</span>
                                    <code className="break-all text-muted-foreground">{setupSnippets.endpoint}</code>
                                </div>
                                <div className="grid gap-1">
                                    <span className="font-medium text-foreground">{t('General.Authorization')}</span>
                                    <code className="break-all text-muted-foreground">Authorization: {setupSnippets.authorizationHeader}</code>
                                </div>
                            </div>
                            <CopyableSnippet title={t('General.JsonTitle')} text={setupSnippets.genericJson} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                        </TabsContent>
                        <TabsContent value="codex" className="mt-3 space-y-3">
                            <CopyableSnippet title={t('Codex.CliTitle')} text={setupSnippets.codexCli} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                            <CopyableSnippet title={t('Codex.TomlTitle')} text={setupSnippets.codexToml} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                        </TabsContent>
                        <TabsContent value="claudeCode" className="mt-3 space-y-3">
                            <CopyableSnippet title={t('ClaudeCode.CliTitle')} text={setupSnippets.claudeCli} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                            <CopyableSnippet title={t('ClaudeCode.JsonTitle')} text={setupSnippets.claudeJson} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                        </TabsContent>
                    </Tabs>
                </div>
            ) : null}

            {message ? (
                <div
                    className={
                        message.type === 'success'
                            ? 'rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400'
                            : 'rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
                    }
                >
                    {message.text}
                </div>
            ) : null}
        </div>
    );
}

function TokenSkeleton() {
    return (
        <div className="flex items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-7 w-7" />
        </div>
    );
}

function CopyableSnippet({ title, text, copyLabel, copiedLabel }: { title: string; text: string; copyLabel: ReactNode; copiedLabel: ReactNode }) {
    const t = useTranslations('DoryUI.Settings.AgentAccess');

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{title}</div>
                <CopyButton
                    text={text}
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!text}
                    aria-label={t('Copy')}
                    title={t('Copy')}
                    label={copyLabel}
                    copiedLabel={copiedLabel}
                />
            </div>
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{text}</pre>
        </div>
    );
}
