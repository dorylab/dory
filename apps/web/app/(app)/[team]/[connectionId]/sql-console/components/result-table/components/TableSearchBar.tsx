"use client";

import { cn } from '@/registry/new-york-v4/lib/utils';
import { Input } from '@/registry/new-york-v4/ui/input';
import { X } from 'lucide-react';
import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export function VTableSearchBar(props: {
    query: string;
    onQueryChange: (s: string) => void;
    onClearQuery?: () => void;
    filteredCount?: number;
    totalCount?: number;
    className?: string;
}) {
    const { query, onQueryChange, onClearQuery, filteredCount, totalCount } = props;
    const inputRef = useRef<HTMLInputElement | null>(null);
    const t = useTranslations('SqlConsole');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                inputRef.current?.focus();
                inputRef.current?.select();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    
    const digits = typeof totalCount === 'number' ? String(Math.max(0, totalCount)).length : 3;
    const template = `${'9'.repeat(digits)} / ${'9'.repeat(digits)}`;

    return (
        <div className={cn('flex items-center gap-2 p-2', props.className)}>
            {typeof filteredCount === 'number' && typeof totalCount === 'number' && (
                <div className="relative flex-none">
                    
                    <span aria-hidden className="invisible block px-1 font-mono tabular-nums text-xs">
                        {template}
                    </span>

                    
                    <span
                        className="absolute inset-0 px-1 font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap flex items-center justify-end"
                        aria-label={t('VTable.Search.FilteredTotalAria')}
                    >
                        {filteredCount} / {totalCount}
                    </span>
                </div>
            )}

            <div className="relative flex-1">
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={e => onQueryChange(e.target.value)}
                    placeholder={t('VTable.Search.Placeholder')}
                    className={cn('h-6 text-xs placeholder:text-xs pr-6')}
                />
                {query && (
                    <button
                        type="button"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                        onClick={onClearQuery}
                        aria-label={t('VTable.Search.ClearAria')}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
