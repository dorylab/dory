'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { authFetch } from '@/lib/client/auth-fetch';
import { authClient } from '@/lib/auth-client';
import { isDesktopRuntime } from '@dory/shared/runtime';
import { SettingsRow } from './SettingsRow';

type McpSettingsPayload = {
    endpoint: string;
};

type McpDesktopGrantPayload = {
    grant: string;
    expiresAt: string;
};

type McpProxyState = {
    enabled: boolean;
    running: boolean;
    endpoint: string;
    error: string | null;
};

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
    const [mcpProxy, setMcpProxy] = useState<McpProxyState | null>(null);
    const [loading, setLoading] = useState(true);
    const [proxyBusy, setProxyBusy] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const { data: session } = authClient.useSession();
    const userId = session?.user?.id ?? null;
    const isDesktop = isDesktopRuntime();
    const effectiveEndpoint = isDesktop ? (mcpProxy?.endpoint ?? settings?.endpoint) : undefined;

    const setupSnippets = useMemo(() => {
        if (!effectiveEndpoint) return '';
        const genericJson = JSON.stringify(
            {
                mcpServers: {
                    dory: {
                        type: 'http',
                        url: effectiveEndpoint,
                    },
                },
            },
            null,
            2,
        );
        const codexCli = [`codex mcp add dory --url ${effectiveEndpoint}`, 'codex mcp list'].join('\n');
        const codexToml = [`[mcp_servers.dory]`, `url = "${effectiveEndpoint}"`].join('\n');
        const claudeCli = [`claude mcp add --transport http dory ${effectiveEndpoint}`, 'claude mcp list'].join('\n');
        const claudeJson = JSON.stringify(
            {
                mcpServers: {
                    dory: {
                        type: 'http',
                        url: effectiveEndpoint,
                    },
                },
            },
            null,
            2,
        );
        return {
            endpoint: effectiveEndpoint,
            genericJson,
            codexCli,
            codexToml,
            claudeCli,
            claudeJson,
        };
    }, [effectiveEndpoint]);

    const loadMcpProxyState = useCallback(async () => {
        if (!isDesktop || typeof window === 'undefined' || !window.mcpBridge) {
            setMcpProxy(null);
            return null;
        }

        const state = await window.mcpBridge.getState(userId ?? undefined);
        setMcpProxy(state);
        return state;
    }, [isDesktop, userId]);

    const loadSettings = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const settingsPromise = authFetch('/api/mcp/settings').then(readJson<McpSettingsPayload>);
            const proxyPromise = loadMcpProxyState().catch(error => {
                setMcpProxy(current =>
                    current
                        ? {
                              ...current,
                              running: false,
                              error: error instanceof Error ? error.message : String(error),
                          }
                        : current,
                );
                return null;
            });
            const [payload] = await Promise.all([settingsPromise, proxyPromise]);
            setSettings(payload);
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('LoadFailed') });
        } finally {
            setLoading(false);
        }
    }, [loadMcpProxyState, t]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    const toggleMcpProxy = async (enabled: boolean) => {
        if (typeof window === 'undefined' || !window.mcpBridge) return;
        if (!userId) {
            setMessage({ type: 'error', text: t('ProxyStartFailed') });
            return;
        }
        setProxyBusy(true);
        setMessage(null);
        try {
            const state = enabled
                ? await window.mcpBridge.start(
                      (
                          await readJson<McpDesktopGrantPayload>(
                              await authFetch('/api/mcp/desktop-grant', {
                                  method: 'POST',
                              }),
                          )
                      ).grant,
                      userId,
                  )
                : await window.mcpBridge.stop(userId);
            setMcpProxy(state);
            if (state.error) {
                setMessage({ type: 'error', text: state.error });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('ProxyStartFailed') });
            await loadMcpProxyState().catch(() => undefined);
        } finally {
            setProxyBusy(false);
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
            {isDesktop ? (
                <div className="space-y-2">
                    <SettingsRow label={t('ProxyLabel')} description={t('ProxyDescription')}>
                        {mcpProxy ? (
                            <Switch
                                checked={mcpProxy.enabled}
                                disabled={proxyBusy || loading || !userId || typeof window === 'undefined' || !window.mcpBridge}
                                onCheckedChange={checked => {
                                    void toggleMcpProxy(checked);
                                }}
                                aria-label={t('ProxyLabel')}
                            />
                        ) : (
                            <Skeleton className="h-5 w-8 rounded-full" />
                        )}
                    </SettingsRow>
                    {mcpProxy?.enabled && !mcpProxy.running ? (
                        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{mcpProxy.error ?? t('ProxyStopped')}</div>
                    ) : null}
                </div>
            ) : null}

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
            ) : isDesktop ? (
                setupSnippets ? (
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
                ) : null
            ) : (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{t('WebAuthorizationStatus')}</div>
            )}

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
