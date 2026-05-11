'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@dory/web-utils';
import { Dialog, DialogContent } from '@/registry/new-york-v4/ui/dialog';
import { getCategories } from './types';
import type { CategoryKey } from './types';
import { SettingsSidebar } from './SettingsSidebar';
import { SettingsContent } from './SettingsContent';

export function SettingsModal({
    open,
    onOpenChange,
    activeCategory = 'appearance',
    onActiveCategoryChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    activeCategory?: CategoryKey;
    onActiveCategoryChange?: (category: CategoryKey) => void;
}) {
    const [query, setQuery] = React.useState('');
    const t = useTranslations('DoryUI.Settings');
    const categories = React.useMemo(() => getCategories(t), [t]);

    React.useEffect(() => {
        if (open) {
            setQuery('');
        }
    }, [open, activeCategory]);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return categories;
        return categories.filter(c => c.label.toLowerCase().includes(q) || (c.tag ?? '').toLowerCase().includes(q));
    }, [categories, query]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn('p-0 gap-0 overflow-hidden', 'sm:max-w-[960px] w-[960px] h-[600px] min-h-0', 'rounded-2xl')}>
                <div className="grid h-full min-h-0 overflow-hidden grid-cols-[280px_minmax(0,1fr)]">
                    <SettingsSidebar active={activeCategory} query={query} onQueryChange={setQuery} onSelect={onActiveCategoryChange ?? (() => undefined)} filtered={filtered} />
                    <SettingsContent active={activeCategory} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
