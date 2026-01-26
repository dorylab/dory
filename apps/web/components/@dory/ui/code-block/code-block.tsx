'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { studioPrismDarkTheme, studioPrismLightTheme } from './studio-prism-theme';

// 注册需要的语言（只注册 sql/json，减少体积）
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('json', json);

type ContentType = 'text' | 'sql' | 'json' | 'auto';

interface SmartCodeBlockProps {
    label?: string;
    value: string;
    type?: ContentType; // 默认 auto
    showLineNumbers?: boolean;
    maxHeightClassName?: string; // 比如 "max-h-80"
    theme?: SyntaxHighlighterProps['style']; // 手动指定主题（优先级最高）
    className?: string;
    // 可选：强制某个 code block 使用 light/dark，而不是跟随全局
    forceThemeMode?: 'light' | 'dark';
    onCopy?: () => void;
}

export function SmartCodeBlock({
    label,
    value,
    type = 'auto',
    className,
    showLineNumbers = false,
    maxHeightClassName = 'max-h-80',
    theme,
    forceThemeMode,
    onCopy,
}: SmartCodeBlockProps) {
    const [copied, setCopied] = React.useState(false);
    const { resolvedTheme } = useTheme();

    const effectiveType = React.useMemo<Exclude<ContentType, 'auto'>>(() => {
        if (type !== 'auto') return type;

        const trimmed = value.trim();

        // 尝试 JSON
        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isJson(trimmed)) {
            return 'json';
        }

        // 简单 SQL 判断
        const upper = trimmed.slice(0, 200).toUpperCase();
        if (/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\b|\bALTER\b|\bDROP\b|\bFROM\b|\bWHERE\b/.test(upper)) {
            return 'sql';
        }

        return 'text';
    }, [type, value]);

    const language = effectiveType === 'sql' ? 'sql' : effectiveType === 'json' ? 'json' : undefined;

    // 计算最终主题：props.theme > forceThemeMode > 全局主题
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
            // 普通文本模式
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
            // 高亮模式
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
        <div className={cn('flex flex-col gap-2', className)}>
            {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}

            <div className={cn('relative group rounded-lg border bg-muted/40', maxHeightClassName, 'overflow-hidden')}>
                {/* 复制按钮 */}
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn(
                        'absolute right-2 top-1 z-10 h-7 w-7 rounded-full border bg-background/80 shadow-sm',
                        'opacity-0 transition-opacity group-hover:opacity-100',
                        copied && 'opacity-100',
                    )}
                    onClick={handleCopy}
                >
                    {copied ? <Check className="h-2 w-2 text-xs" /> : <Copy className="h-2 w-2 text-xs" />}
                </Button>

                <div className={cn('relative overflow-auto bg-card rounded-lg p-3', maxHeightClassName)}>
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
