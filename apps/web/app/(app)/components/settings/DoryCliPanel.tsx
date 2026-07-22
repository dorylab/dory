'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

const CLI_INSTALL_COMMAND = 'npm install -g @getdory/cli';
const CODEX_SETUP_COMMAND = 'codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone';
const CLAUDE_SETUP_COMMAND = 'claude mcp add --scope user dory -- npx -y @getdory/cli mcp serve --stdio --data standalone';
const CLI_PACKAGE_URL = 'https://www.npmjs.com/package/@getdory/cli';

export function DoryCliPanel() {
    const t = useTranslations('DoryUI.Settings.DoryCli');

    return (
        <div className="space-y-6">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t('Intro')}</p>

            <div className="grid gap-3 sm:grid-cols-2">
                {(['Agents', 'Headless', 'Workspace', 'Automation'] as const).map(key => (
                    <div key={key} className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{t(`Benefits.${key}`)}</span>
                    </div>
                ))}
            </div>

            <Card className="gap-4 py-5 shadow-none">
                <CardHeader className="px-5">
                    <CardTitle className="text-sm">{t('Install.Title')}</CardTitle>
                    <CardDescription>{t('Install.Description')}</CardDescription>
                </CardHeader>
                <CardContent className="px-5">
                    <CommandBlock title={t('Install.CommandTitle')} command={CLI_INSTALL_COMMAND} copyLabel={t('Copy')} />
                </CardContent>
            </Card>

            <section className="space-y-3" aria-labelledby="dory-cli-agent-setup">
                <div>
                    <h3 id="dory-cli-agent-setup" className="text-sm font-semibold">
                        {t('Setup.Title')}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t('Setup.Description')}</p>
                </div>
                <Tabs defaultValue="codex" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="codex">Codex</TabsTrigger>
                        <TabsTrigger value="claude">Claude Code</TabsTrigger>
                    </TabsList>
                    <TabsContent value="codex" className="mt-3">
                        <CommandBlock title="Codex CLI" command={CODEX_SETUP_COMMAND} copyLabel={t('Copy')} />
                    </TabsContent>
                    <TabsContent value="claude" className="mt-3">
                        <CommandBlock title="Claude Code CLI" command={CLAUDE_SETUP_COMMAND} copyLabel={t('Copy')} />
                    </TabsContent>
                </Tabs>
            </section>

            <section className="space-y-3" aria-labelledby="dory-cli-workspace-modes">
                <h3 id="dory-cli-workspace-modes" className="text-sm font-semibold">
                    {t('WorkspaceModes.Title')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{t('WorkspaceModes.Standalone.Title')}</span>
                            <Badge variant="secondary">{t('WorkspaceModes.Recommended')}</Badge>
                        </div>
                        <code className="block text-xs text-muted-foreground">--data standalone · ~/.dory</code>
                        <p className="text-xs leading-5 text-muted-foreground">{t('WorkspaceModes.Standalone.Description')}</p>
                    </div>
                    <div className="space-y-2 rounded-lg border p-4">
                        <span className="text-sm font-medium">{t('WorkspaceModes.Desktop.Title')}</span>
                        <code className="block text-xs text-muted-foreground">--data desktop</code>
                        <p className="text-xs leading-5 text-muted-foreground">{t('WorkspaceModes.Desktop.Description')}</p>
                    </div>
                </div>
            </section>

            <a
                href={CLI_PACKAGE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
                {t('LearnMore')}
                <ExternalLink className="size-3.5" />
            </a>
        </div>
    );
}

function CommandBlock({ title, command, copyLabel }: { title: string; command: string; copyLabel: string }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{title}</div>
                <CopyButton
                    text={command}
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={copyLabel}
                    title={copyLabel}
                    label={<Copy className="size-3.5" />}
                    copiedLabel={<Check className="size-3.5" />}
                />
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{command}</pre>
        </div>
    );
}
