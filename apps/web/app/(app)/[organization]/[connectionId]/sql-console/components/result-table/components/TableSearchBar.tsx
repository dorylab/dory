'use client';

import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Search, X } from 'lucide-react';
import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

export function VTableSearchBar(props: {
    query: string;
    onQueryChange: (s: string) => void;
    onClearQuery?: () => void;
    onSearchSubmit?: () => void;
    filteredCount?: number;
    totalCount?: number;
    className?: string;
}) {
    const { query, onQueryChange, onClearQuery, onSearchSubmit, filteredCount, totalCount } = props;
    const [draftQuery, setDraftQuery] = useState(query);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const t = useTranslations('SqlConsole');

    useEffect(() => {
        setDraftQuery(query);
    }, [query]);

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

    const submitSearch = useCallback(() => {
        onQueryChange(draftQuery);
        onSearchSubmit?.();
    }, [draftQuery, onQueryChange, onSearchSubmit]);

    const clearSearch = useCallback(() => {
        setDraftQuery('');
        onQueryChange('');
        onClearQuery?.();
    }, [onClearQuery, onQueryChange]);

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

            <div className="relative flex-1 min-w-0">
                <Input
                    ref={inputRef}
                    value={draftQuery}
                    onChange={e => setDraftQuery(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            submitSearch();
                        }
                    }}
                    placeholder={t('VTable.Search.Placeholder')}
                    className={cn('h-6 text-xs placeholder:text-xs pr-6')}
                />
                {draftQuery && (
                    <button
                        type="button"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                        onClick={clearSearch}
                        aria-label={t('VTable.Search.ClearAria')}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
            <Button type="button" variant="outline" size="sm" className="h-6 flex-none gap-1 px-2 text-xs" onClick={submitSearch} aria-label={t('VTable.Search.SubmitAria')}>
                <Search className="h-3.5 w-3.5" />
                {t('VTable.Search.Submit')}
            </Button>
        </div>
    );
}
