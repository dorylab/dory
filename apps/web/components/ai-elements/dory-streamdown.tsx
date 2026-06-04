'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { cn } from '@dory/web-utils';
import mermaid, { type MermaidConfig } from 'mermaid';
import { CheckIcon, CopyIcon, DownloadIcon, ExpandIcon, Loader2Icon, RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CustomRendererProps, PluginConfig } from 'streamdown';

import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';

const doryCodeRendererLanguages = [
    'sql',
    'pgsql',
    'postgres',
    'postgresql',
    'mysql',
    'sqlite',
    'json',
    'jsonc',
    'javascript',
    'js',
    'typescript',
    'ts',
    'tsx',
    'jsx',
    'bash',
    'sh',
    'shell',
    'python',
    'py',
    'yaml',
    'yml',
    'html',
    'css',
    'markdown',
    'md',
    'text',
    'txt',
];

const mermaidConfig: MermaidConfig = {
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'monospace',
    suppressErrorRendering: true,
};

const MIN_SCALE = 0.45;
const MAX_SCALE = 8;
const ZOOM_STEP = 0.25;

const clampScale = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));

function hashText(text: string) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function downloadFile(fileName: string, content: BlobPart, type: string) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

async function copyText(text: string) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
    } catch {
        // Fall back to a temporary textarea below.
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
    }
}

function DoryMarkdownCodeBlock({ code, language }: CustomRendererProps) {
    const normalizedLanguage = language.toLowerCase();
    const displayCode = code.trimEnd();
    const type =
        normalizedLanguage.includes('sql') ||
        normalizedLanguage === 'pgsql' ||
        normalizedLanguage === 'postgres' ||
        normalizedLanguage === 'postgresql' ||
        normalizedLanguage === 'mysql' ||
        normalizedLanguage === 'sqlite'
            ? 'sql'
            : normalizedLanguage === 'json' || normalizedLanguage === 'jsonc'
              ? 'json'
              : 'text';

    return <SmartCodeBlock className="mt-3" label={language || undefined} value={displayCode} type={type} showLineNumbers maxHeightClassName="max-h-[min(32rem,70vh)]" />;
}

type MermaidActionButtonProps = ComponentProps<typeof Button> & {
    label: string;
};

function MermaidActionButton({ label, children, className, disabled, ...props }: MermaidActionButtonProps) {
    const button = (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn('h-8 w-8 min-w-0 rounded-full p-0 text-muted-foreground hover:bg-accent hover:text-foreground', className)}
            disabled={disabled}
            aria-label={label}
            {...props}
        >
            {children}
            <span className="sr-only">{label}</span>
        </Button>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}

type MermaidViewportProps = {
    svg: string | null;
    error: string | null;
    isPending: boolean;
    isRendering: boolean;
    onRetry: () => void;
    className?: string;
    fullscreen?: boolean;
};

function MermaidViewport({ svg, error, isPending, isRendering, onRetry, className, fullscreen = false }: MermaidViewportProps) {
    const t = useTranslations('DoryUI');
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
    } | null>(null);

    const zoomBy = useCallback((delta: number) => {
        setScale(current => clampScale(current + delta));
    }, []);

    const resetView = useCallback(() => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    }, []);

    const handleWheel = useCallback(
        (event: React.WheelEvent<HTMLDivElement>) => {
            if (!svg) return;
            event.preventDefault();
            zoomBy(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
        },
        [svg, zoomBy],
    );

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (!svg || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panStartRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                offsetX: offset.x,
                offsetY: offset.y,
            };
            setIsPanning(true);
        },
        [offset.x, offset.y, svg],
    );

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const start = panStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        event.preventDefault();
        setOffset({
            x: start.offsetX + event.clientX - start.startX,
            y: start.offsetY + event.clientY - start.startY,
        });
    }, []);

    const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const start = panStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        panStartRef.current = null;
        setIsPanning(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
    }, []);

    useEffect(() => {
        resetView();
    }, [resetView, svg]);

    const showBusy = isPending || isRendering;

    return (
        <div className={cn('relative overflow-hidden bg-background', fullscreen ? 'h-full min-h-0' : 'h-[24rem] sm:h-[30rem]', className)} onWheel={handleWheel}>
            {showBusy ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    <span>{isPending ? t('Mermaid.Waiting') : t('Mermaid.Rendering')}</span>
                </div>
            ) : error ? (
                <div className="flex h-full flex-col items-start justify-center gap-3 px-4 py-6 text-sm">
                    <div className="max-w-full rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-destructive">{t('Mermaid.RenderError', { error })}</div>
                    <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                        {t('Mermaid.Retry')}
                    </Button>
                </div>
            ) : svg ? (
                <>
                    <div
                        className={cn('flex h-full w-full items-center justify-center touch-none', isPanning ? 'cursor-grabbing' : 'cursor-grab')}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerEnd}
                        onPointerCancel={handlePointerEnd}
                        role="application"
                    >
                        <div
                            className="flex origin-center items-center justify-center transition-transform duration-150 ease-out [&_svg]:h-auto [&_svg]:max-w-none"
                            style={{
                                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                                willChange: 'transform',
                            }}
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    </div>
                    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg border border-border/60 bg-background/85 p-1 shadow-sm backdrop-blur">
                        <MermaidActionButton label={t('Mermaid.ZoomIn')} onClick={() => zoomBy(ZOOM_STEP)} disabled={scale >= MAX_SCALE}>
                            <ZoomInIcon className="h-4 w-4" />
                        </MermaidActionButton>
                        <MermaidActionButton label={t('Mermaid.ZoomOut')} onClick={() => zoomBy(-ZOOM_STEP)} disabled={scale <= MIN_SCALE}>
                            <ZoomOutIcon className="h-4 w-4" />
                        </MermaidActionButton>
                        <MermaidActionButton label={t('Mermaid.ResetView')} onClick={resetView}>
                            <RotateCcwIcon className="h-4 w-4" />
                        </MermaidActionButton>
                    </div>
                </>
            ) : null}
        </div>
    );
}

function DoryMarkdownMermaidBlock({ code: source, isIncomplete }: CustomRendererProps) {
    const t = useTranslations('DoryUI');
    const rawId = useId();
    const renderId = useMemo(() => `dory-mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}-${hashText(source)}`, [rawId, source]);
    const [svg, setSvg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [renderNonce, setRenderNonce] = useState(0);
    const [copied, setCopied] = useState(false);
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

    const trimmedSource = source.trim();

    useEffect(() => {
        if (!trimmedSource || isIncomplete) {
            setSvg(null);
            setError(null);
            setIsRendering(false);
            return;
        }

        let cancelled = false;

        async function renderDiagram() {
            setIsRendering(true);
            setError(null);
            try {
                mermaid.initialize(mermaidConfig);
                const result = await mermaid.render(renderId, trimmedSource);
                if (cancelled) return;
                setSvg(result.svg);
            } catch (renderError) {
                if (cancelled) return;
                setSvg(null);
                setError(renderError instanceof Error ? renderError.message : String(renderError));
            } finally {
                if (!cancelled) {
                    setIsRendering(false);
                }
            }
        }

        void renderDiagram();

        return () => {
            cancelled = true;
        };
    }, [isIncomplete, renderId, renderNonce, trimmedSource]);

    const handleCopy = async () => {
        try {
            await copyText(trimmedSource);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            setError(t('Mermaid.CopyFailed'));
        }
    };

    const handleDownloadSvg = () => {
        if (!svg) return;
        try {
            downloadFile('mermaid-diagram.svg', svg, 'image/svg+xml;charset=utf-8');
        } catch {
            setError(t('Mermaid.DownloadFailed'));
        }
    };

    const handleRetry = () => {
        setRenderNonce(current => current + 1);
    };

    const canUseRenderedSvg = Boolean(svg && !isIncomplete && !isRendering);

    return (
        <div className="not-prose my-3 w-full overflow-hidden rounded-lg border border-border/60 bg-background shadow-none" data-dory-streamdown="mermaid">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-3 py-2">
                <div className="min-w-0 text-sm font-medium text-foreground">{t('Mermaid.Title')}</div>
                <div className="flex shrink-0 items-center gap-1">
                    <MermaidActionButton label={t('Mermaid.CopySource')} onClick={handleCopy}>
                        {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                    </MermaidActionButton>
                    <MermaidActionButton label={t('Mermaid.DownloadSvg')} onClick={handleDownloadSvg} disabled={!canUseRenderedSvg}>
                        <DownloadIcon className="h-4 w-4" />
                    </MermaidActionButton>
                    <MermaidActionButton label={t('Mermaid.ViewFullscreen')} onClick={() => setIsFullscreenOpen(true)} disabled={!canUseRenderedSvg}>
                        <ExpandIcon className="h-4 w-4" />
                    </MermaidActionButton>
                </div>
            </div>

            <MermaidViewport svg={svg} error={error} isPending={isIncomplete} isRendering={isRendering} onRetry={handleRetry} />

            <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
                <DialogContent className="h-screen w-screen !max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 p-0" showCloseButton>
                    <DialogTitle className="border-b border-border/50 bg-muted/20 px-4 py-3 pr-12 text-sm font-medium">{t('Mermaid.Title')}</DialogTitle>
                    <MermaidViewport svg={svg} error={error} isPending={isIncomplete} isRendering={isRendering} onRetry={handleRetry} fullscreen />
                </DialogContent>
            </Dialog>
        </div>
    );
}

export const doryStreamdownPlugins = {
    code,
    math,
    cjk,
    renderers: [
        {
            language: ['mermaid', 'mmd'],
            component: DoryMarkdownMermaidBlock,
        },
        {
            language: doryCodeRendererLanguages,
            component: DoryMarkdownCodeBlock,
        },
    ],
} satisfies PluginConfig;
