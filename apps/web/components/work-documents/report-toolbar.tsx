'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { WorkDocumentView, WorkVisual } from '@dory/shared/types/work-document';
import { ArrowLeft, ChevronDown, Download, MoreHorizontal, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { ReportMode } from '@/lib/work-documents/report-blocks';

type Props = {
    mode: ReportMode;
    onMode: (mode: ReportMode) => void;
    document: WorkDocumentView;
    standalone: boolean;
    historical: boolean;
    editing: boolean;
    dirty: boolean;
    saving: boolean;
    saveError: boolean;
    unavailable: boolean;
    disabled: boolean;
    onCancel: () => void;
    canExport: boolean;
    versions: Array<{ revision: number; version?: number; sourceChatId?: string | null; source: string; createdAt: string }>;
    latestRevision?: number;
    onOpenWorkspace?: () => void;
    workspaceAvailable: boolean;
    onBack: () => void;
    onContinue: () => void;
    onEdit: () => void;
    onTitle: (title: string) => void;
    onSourceChat: (chatId: string) => void;
    onVersion: (revision: number | null) => void;
    onExport: (format: 'html' | 'pdf' | 'markdown' | 'mdx') => void;
    editorReady: boolean;
    onInsert: (type: WorkVisual['type']) => void;
};
function IconHint({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}
export function ReportToolbar(p: Props) {
    const host = useRef<HTMLElement>(null);
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        if (!host.current) return;
        const observer = new ResizeObserver(entries => setCompact(entries[0].target.getBoundingClientRect().width < 720));
        observer.observe(host.current);
        return () => observer.disconnect();
    }, []);
    const t = useTranslations('WorkDocuments');
    const r = useTranslations('WorkDocuments.Report');
    const locale = useLocale();
    const days = new Map<string, Props['versions']>();
    for (const entry of p.versions) {
        const day = new Date(entry.createdAt).toLocaleDateString(locale, { dateStyle: 'medium' });
        const entries = days.get(day);
        if (entries) entries.push(entry);
        else days.set(day, [entry]);
    }
    const exports = (
        <>
            <DropdownMenuItem onSelect={() => p.onExport('html')}>HTML</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExport('pdf')}>{t('ExportPdf')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExport('markdown')}>{t('ExportMarkdown')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExport('mdx')}>Dory MDX ZIP</DropdownMenuItem>
        </>
    );
    return (
        <header ref={host} className="report-toolbar sticky top-0 z-20 mb-4 flex h-11 shrink-0 items-center gap-1.5 border-b bg-background px-3" data-testid="report-toolbar">
            {p.standalone && (
                <IconHint label={t('BackToReports')}>
                    <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={t('BackToReports')} onClick={p.onBack}>
                        <ArrowLeft className="size-3.5" />
                    </Button>
                </IconHint>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className={p.editing ? 'w-full min-w-0 max-w-md' : 'min-w-0'}>
                    {p.editing ? (
                        <Input
                            className="h-7 border-transparent px-2 text-sm shadow-none hover:border-input focus-visible:border-input md:text-sm"
                            aria-label={t('Title')}
                            value={p.document.title}
                            maxLength={160}
                            onChange={event => p.onTitle(event.target.value)}
                        />
                    ) : (
                        <h1 className="truncate text-sm font-medium" title={p.document.title}>
                            {p.document.title}
                        </h1>
                    )}
                </div>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        className="report-status h-6 max-w-40 shrink-0 gap-1 px-1.5 text-[11px]"
                        variant="ghost"
                        size="sm"
                        disabled={p.unavailable}
                        aria-label={r('VersionMenu')}
                    >
                        <span className="truncate">{r('VersionMenu')}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[70dvh] max-w-[calc(100vw-2rem)] overflow-y-auto">
                    <DropdownMenuRadioGroup value={String(p.document.revision)} onValueChange={value => p.onVersion(value === String(p.latestRevision) ? null : Number(value))}>
                        {[...days].map(([day, entries]) => (
                            <div key={day}>
                                <DropdownMenuLabel>{day}</DropdownMenuLabel>
                                {entries.map(item => (
                                    <div key={item.revision}>
                                        <DropdownMenuRadioItem value={String(item.revision)}>
                                            {new Date(item.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} ·{' '}
                                            {t(
                                                `VersionHistory.${item.source === 'agent' ? 'Agent' : item.source === 'workspace' ? 'Workspace' : item.source === 'restore' ? 'Restored' : item.source === 'baseline' ? 'Baseline' : 'User'}`,
                                            )}{' '}
                                            · v{item.version ?? item.revision}
                                            {item.revision === p.latestRevision && ` · ${t('VersionHistory.Latest')}`}
                                        </DropdownMenuRadioItem>
                                        {item.sourceChatId && (
                                            <DropdownMenuItem onSelect={() => p.onSourceChat(item.sourceChatId!)}>{t('VersionHistory.OpenChat')}</DropdownMenuItem>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            {p.onOpenWorkspace && !compact && (
                <Button
                    className="h-7 min-w-0 shrink px-2 text-xs"
                    size="sm"
                    variant="ghost"
                    disabled={p.disabled || p.unavailable || !p.workspaceAvailable}
                    onClick={p.onOpenWorkspace}
                    aria-label={t('ConnectedWorkspace.OpenWorkspace')}
                    title={t('ConnectedWorkspace.OpenWorkspace')}
                >
                    <span className="truncate">{t('ConnectedWorkspace.OpenWorkspace')}</span>
                </Button>
            )}
            {p.editing && (
                <span
                    role="status"
                    aria-live="polite"
                    title={p.saveError ? t('Resources.SaveFailed') : p.saving ? t('Saving') : p.dirty ? t('Unsaved') : t('Saved')}
                    className={p.saveError ? 'report-save-error text-xs text-destructive' : 'report-toolbar-secondary whitespace-nowrap text-xs text-muted-foreground'}
                >
                    {p.saveError ? r('SaveFailedShort') : p.saving ? t('Saving') : p.dirty ? t('Unsaved') : t('Saved')}
                </span>
            )}
            {p.document.archivedAt && <span className="report-toolbar-secondary text-xs text-muted-foreground">{t('Archived')}</span>}
            <Button className="report-toolbar-secondary h-7 shrink-0 px-2.5 text-xs" size="sm" variant="outline" disabled={p.disabled} onClick={p.onContinue}>
                {t('Continue')}
            </Button>
            {p.editing && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="report-toolbar-secondary size-7 shrink-0"
                            disabled={!p.editorReady}
                            data-report-insert
                            aria-label={r('InsertComponent')}
                            title={r('InsertComponent')}
                        >
                            <Plus className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {(['metric', 'chart', 'table'] as const).map(type => (
                            <DropdownMenuItem key={type} onSelect={() => p.onInsert(type)}>
                                {r(type === 'metric' ? 'Metric' : type === 'chart' ? 'Chart' : 'Table')}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {!p.historical &&
                (compact ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" aria-label={r('Mode')}>
                                {r(p.mode === 'view' ? 'ViewMode' : p.mode === 'blocks' ? 'BlockMode' : 'SourceMode')}
                                <ChevronDown className="ml-1 size-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuRadioGroup value={p.mode} onValueChange={value => p.onMode(value as ReportMode)}>
                                {(['view', 'blocks', 'source'] as const).map(mode => (
                                    <DropdownMenuRadioItem key={mode} value={mode} disabled={p.unavailable || (mode !== 'view' && p.disabled) || (mode === 'view' && p.saving)}>
                                        {r(mode === 'view' ? 'ViewMode' : mode === 'blocks' ? 'BlockMode' : 'SourceMode')}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <div role="group" aria-label={r('Mode')} className="flex shrink-0 rounded-md border p-0.5">
                        {(['view', 'blocks', 'source'] as const).map(mode => (
                            <Button
                                key={mode}
                                type="button"
                                size="sm"
                                variant={p.mode === mode ? 'secondary' : 'ghost'}
                                className="h-6 px-2 text-xs"
                                aria-pressed={p.mode === mode}
                                disabled={p.unavailable || (mode !== 'view' && p.disabled) || (mode === 'view' && p.saving)}
                                onClick={() => p.onMode(mode)}
                            >
                                {r(mode === 'view' ? 'ViewMode' : mode === 'blocks' ? 'BlockMode' : 'SourceMode')}
                            </Button>
                        ))}
                    </div>
                ))}
            {p.editing && (
                <>
                    <Button size="sm" className="h-7 px-2 text-xs" variant="ghost" disabled={p.saving} onClick={p.onCancel}>
                        {t('Resources.Cancel')}
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-xs" disabled={p.saving || p.disabled} onClick={p.onEdit}>
                        {t('Save')}
                    </Button>
                </>
            )}
            <DropdownMenu>
                <IconHint label={t('Export')}>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" className="report-toolbar-secondary size-7 shrink-0" variant="ghost" aria-label={t('Export')} disabled={!p.canExport}>
                            <Download className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                </IconHint>
                <DropdownMenuContent align="end">{exports}</DropdownMenuContent>
            </DropdownMenu>
            {compact && (
                <DropdownMenu>
                    <IconHint label={r('More')}>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-7 shrink-0" data-report-more aria-label={r('More')}>
                                <MoreHorizontal className="size-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                    </IconHint>
                    <DropdownMenuContent align="end">
                        <div className="report-toolbar-overflow" style={{ display: compact ? undefined : 'none' }}>
                            {p.onOpenWorkspace && (
                                <DropdownMenuItem disabled={p.disabled || p.unavailable || !p.workspaceAvailable} onSelect={p.onOpenWorkspace}>
                                    {t('ConnectedWorkspace.OpenWorkspace')}
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem disabled={p.disabled} onSelect={p.onContinue}>
                                {t('Continue')}
                            </DropdownMenuItem>
                            {p.editing && (
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger disabled={!p.editorReady}>{r('InsertComponent')}</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        {(['metric', 'chart', 'table'] as const).map(type => (
                                            <DropdownMenuItem key={type} onSelect={() => p.onInsert(type)}>
                                                {r(type === 'metric' ? 'Metric' : type === 'chart' ? 'Chart' : 'Table')}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            )}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger disabled={!p.canExport}>{t('Export')}</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>{exports}</DropdownMenuSubContent>
                            </DropdownMenuSub>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </header>
    );
}
