'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import { useTheme } from 'next-themes';

import { cn } from '@dory/web-utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { studioPrismDarkTheme, studioPrismLightTheme } from './studio-prism-theme';

SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('json', json);

type ContentType = 'text' | 'sql' | 'json' | 'auto';

interface SmartCodeBlockProps {
    label?: string;
    value: string;
    type?: ContentType;
    showLineNumbers?: boolean;
    maxHeightClassName?: string;
    theme?: SyntaxHighlighterProps['style'];
    className?: string;
    variant?: 'default' | 'soft' | 'bare' | 'codex';
    forceThemeMode?: 'light' | 'dark';
    onCopy?: () => void;
    actions?: React.ReactNode;
}

export function SmartCodeBlock({
    label,
    value,
    type = 'auto',
    className,
    showLineNumbers = false,
    maxHeightClassName = 'max-h-80',
    theme,
    variant = 'default',
    forceThemeMode,
    onCopy,
    actions,
}: SmartCodeBlockProps) {
    const [copied, setCopied] = React.useState(false);
    const { resolvedTheme } = useTheme();

    const effectiveType = React.useMemo<Exclude<ContentType, 'auto'>>(() => {
        if (type !== 'auto') return type;

        const trimmed = value.trim();

        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isJson(trimmed)) {
            return 'json';
        }

        const upper = trimmed.slice(0, 200).toUpperCase();
        if (/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\b|\bALTER\b|\bDROP\b|\bFROM\b|\bWHERE\b/.test(upper)) {
            return 'sql';
        }

        return 'text';
    }, [type, value]);

    const language = effectiveType === 'sql' ? 'sql' : effectiveType === 'json' ? 'json' : undefined;

    const finalTheme = React.useMemo<SyntaxHighlighterProps['style'] | undefined>(() => {
        if (theme) return theme;

        const mode = forceThemeMode ?? (resolvedTheme === 'dark' ? 'dark' : 'light');

        return mode === 'dark' ? studioPrismDarkTheme : studioPrismLightTheme;
    }, [theme, forceThemeMode, resolvedTheme]);

    async function handleCopy() {
        let copiedSuccessfully = false;
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(value);
                copiedSuccessfully = true;
            } catch {
                copiedSuccessfully = false;
            }
        }

        if (!copiedSuccessfully) {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', 'true');
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                copiedSuccessfully = true;
            } finally {
                document.body.removeChild(ta);
            }
        }

        if (copiedSuccessfully) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
            onCopy?.();
        }
    }

    const contentNode =
        language == null ? (
            <pre
                className={cn(
                    'whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-relaxed text-foreground',
                    maxHeightClassName,
                    'overflow-auto',
                )}
            >
                {value}
            </pre>
        ) : (
            <SyntaxHighlighter
                language={language}
                style={finalTheme}
                showLineNumbers={showLineNumbers}
                customStyle={{
                    margin: 0,
                    background: 'transparent',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    fontFamily: 'var(--font-mono, monospace)',
                }}
                codeTagProps={{
                    style: { fontFamily: 'var(--font-mono, monospace)' },
                }}
                wrapLongLines
            >
                {value}
            </SyntaxHighlighter>
        );

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}

            <div
                className={cn(
                    'relative group overflow-hidden',
                    variant === 'codex'
                        ? 'rounded-none bg-muted/38'
                        : variant === 'soft'
                          ? 'rounded-xl bg-muted/50'
                          : variant === 'bare'
                            ? 'rounded-lg bg-transparent'
                            : 'rounded-lg border bg-muted/40',
                    maxHeightClassName,
                )}
            >
                <div
                    className={cn(
                        'absolute right-1 top-1 z-10 flex items-center gap-0.5',
                        'opacity-0 transition-opacity group-hover:opacity-100',
                        (copied || actions) && 'opacity-100',
                    )}
                >
                    <Button
                        type="button"
                        size="icon"
                        variant={variant === 'soft' || variant === 'codex' ? 'ghost' : 'outline'}
                        className={cn(
                            variant === 'bare'
                                ? 'h-5 w-5 rounded-full bg-background/68 shadow-sm backdrop-blur-[2px]'
                                : 'h-6 w-6 rounded-full bg-background/68 shadow-sm backdrop-blur-[2px]',
                            variant === 'soft' || variant === 'bare' || variant === 'codex' ? 'border-0' : 'border',
                        )}
                        onClick={handleCopy}
                    >
                        {copied ? (
                            <Check className={variant === 'bare' ? 'h-2.5 w-2.5' : 'h-2 w-2 text-xs'} />
                        ) : (
                            <Copy className={variant === 'bare' ? 'h-2.5 w-2.5' : 'h-2 w-2 text-xs'} />
                        )}
                    </Button>
                    {actions}
                </div>

                <div
                    className={cn(
                        'relative overflow-auto',
                        variant === 'codex'
                            ? 'rounded-none bg-transparent px-5 py-4'
                            : variant === 'soft'
                              ? 'rounded-xl bg-transparent p-4'
                              : variant === 'bare'
                                ? 'rounded-lg bg-transparent px-2 py-1.5'
                                : 'rounded-lg bg-card p-3',
                        maxHeightClassName,
                    )}
                >
                    {contentNode}
                </div>
            </div>
        </div>
    );
}

function isJson(text: string): boolean {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}
