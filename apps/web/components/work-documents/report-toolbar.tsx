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
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { WorkDocumentView, WorkVisual } from '@dory/shared/types/work-document';
import { ArrowLeft, ChevronDown, Download, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Props = {
    document: WorkDocumentView;
    standalone: boolean;
    historical: boolean;
    editing: boolean;
    dirty: boolean;
    saving: boolean;
    saveError: boolean;
    unavailable: boolean;
    disabled: boolean;
    canPublish: boolean;
    canExport: boolean;
    publications: Array<{ id: string; number: number; revision: number; publishedAt: string }>;
    versions: Array<{ revision: number; source: string; createdAt: string }>;
    latestRevision?: number;
    onBack: () => void;
    onContinue: () => void;
    onEdit: () => void;
    onTitle: (title: string) => void;
    onPublish: () => void;
    onVersion: (value: string) => void;
    onDetails: () => void;
    onRestore: () => void;
    onExport: (format: 'html' | 'pdf' | 'markdown' | 'mdx') => void;
    onInsert: (type: WorkVisual['type']) => void;
};
function IconHint({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
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
    const version = p.document.publication ? `publication:${p.document.publication.id}` : p.historical ? `revision:${p.document.revision}` : 'draft';
    const status = p.document.publication
        ? r('Published', { number: p.document.publication.number })
        : p.historical
          ? r('HistoricalRevision', { revision: p.document.revision })
          : r('Draft');
    const exports = (
        <>
            <DropdownMenuItem onSelect={() => p.onExport('html')}>HTML</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExport('pdf')}>{t('ExportPdf')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExport('markdown')}>{t('ExportMarkdown')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExport('mdx')}>Dory MDX ZIP</DropdownMenuItem>
        </>
    );
    return (
        <header ref={host} className="report-toolbar sticky top-0 z-20 mb-4 flex h-11 items-center gap-1.5 border-b bg-background px-3" data-testid="report-toolbar">
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
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            className="report-status h-6 max-w-40 shrink-0 gap-1 px-1.5 text-[11px]"
                            variant="ghost"
                            size="sm"
                            disabled={p.unavailable}
                            aria-label={r('VersionMenu')}
                        >
                            <span className="truncate">{status}</span>
                            <ChevronDown className="size-3 shrink-0" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-[70dvh] max-w-[calc(100vw-2rem)] overflow-y-auto">
                        <DropdownMenuRadioGroup value={version} onValueChange={p.onVersion}>
                            <DropdownMenuRadioItem value="draft">{r('Draft')}</DropdownMenuRadioItem>
                            {p.publications.length > 0 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>{r('PublishedVersions')}</DropdownMenuLabel>
                                    {p.publications.map(item => (
                                        <DropdownMenuRadioItem key={item.id} value={`publication:${item.id}`}>
                                            {r('Published', { number: item.number })}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </>
                            )}
                            {p.versions.length > 0 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>{r('History')}</DropdownMenuLabel>
                                    {p.versions.map(item => (
                                        <DropdownMenuRadioItem key={item.revision} value={`revision:${item.revision}`}>
                                            r{item.revision} · {new Date(item.createdAt).toLocaleString()}
                                            {item.revision === p.latestRevision ? ` · ${t('VersionHistory.Latest')}` : ''}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </>
                            )}
                        </DropdownMenuRadioGroup>
                        {!p.historical && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={!p.canPublish} onSelect={p.onPublish}>
                                    {r('Publish')}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
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
            {p.editing ? (
                <Button size="sm" className="h-7 shrink-0 px-2.5 text-xs" variant="outline" disabled={p.saving} onClick={p.onEdit}>
                    {t('Done')}
                </Button>
            ) : (
                <IconHint label={t('Edit')}>
                    <Button
                        size="icon"
                        className="report-toolbar-secondary size-7 shrink-0"
                        variant="ghost"
                        aria-label={t('Edit')}
                        disabled={p.disabled || p.unavailable}
                        onClick={p.onEdit}
                    >
                        <Pencil className="size-3.5" />
                    </Button>
                </IconHint>
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
            <DropdownMenu>
                <IconHint label={r('More')}>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-7 shrink-0" data-report-more aria-label={r('More')}>
                            <MoreHorizontal className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                </IconHint>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={p.unavailable} onSelect={p.onDetails}>
                        {r('Details')}
                    </DropdownMenuItem>
                    <div className="report-toolbar-overflow" style={{ display: compact ? undefined : 'none' }}>
                        <DropdownMenuItem disabled={p.disabled} onSelect={p.onContinue}>
                            {t('Continue')}
                        </DropdownMenuItem>
                        {!p.editing && (
                            <DropdownMenuItem disabled={p.disabled || p.unavailable} onSelect={p.onEdit}>
                                {t('Edit')}
                            </DropdownMenuItem>
                        )}
                        {p.editing && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>{r('InsertComponent')}</DropdownMenuSubTrigger>
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
                    {p.historical && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={p.disabled || p.unavailable} onSelect={p.onRestore}>
                                {t('VersionHistory.Restore')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => p.onVersion('draft')}>{t('VersionHistory.BackToLatest')}</DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
