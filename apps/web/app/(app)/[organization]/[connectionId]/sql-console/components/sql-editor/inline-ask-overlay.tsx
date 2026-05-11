'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

type InlineAskOverlayProps = {
    open: boolean;
    promptDraft: string;
    isGenerating: boolean;
    errorMessage?: string | null;
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
};

export function InlineAskOverlay({ open, promptDraft, isGenerating, errorMessage, onPromptChange, onSubmit, onCancel }: InlineAskOverlayProps) {
    const t = useTranslations('SqlConsole');
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!open) return;

        const timer = window.setTimeout(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(promptDraft.length, promptDraft.length);
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [open, promptDraft.length]);

    if (!open) return null;

    return (
        <div className="absolute inset-0 z-20 bg-background/92 backdrop-blur-[1px]">
            <div className="flex h-full flex-col px-12 py-7">
                <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>{t('InlineAsk.Badge')}</span>
                </div>

                <div className="w-full max-w-6xl px-4">
                    <Textarea
                        ref={textareaRef}
                        value={promptDraft}
                        onChange={event => onPromptChange(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancel();
                                return;
                            }

                            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                if (!isGenerating && promptDraft.trim()) {
                                    onSubmit();
                                }
                            }
                        }}
                        placeholder={t('InlineAsk.Placeholder')}
                        rows={3}
                        disabled={isGenerating}
                        className={cn(
                            'min-h-0 w-full resize-none border-0 bg-transparent px-2 py-0 text-3xl italic leading-tight text-foreground shadow-none focus-visible:ring-0',
                            'placeholder:text-muted-foreground/70',
                        )}
                    />

                    {isGenerating ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('InlineAsk.Generating')}
                            </span>
                        </div>
                    ) : null}

                    {errorMessage ? <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</div> : null}
                </div>
            </div>
        </div>
    );
}
