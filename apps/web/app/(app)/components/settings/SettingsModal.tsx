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
    includeOrganizationSettings = false,
    includeBillingSettings = false,
    billingManagementAvailable = false,
    desktopBillingHandoff = false,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    activeCategory?: CategoryKey;
    onActiveCategoryChange?: (category: CategoryKey) => void;
    includeOrganizationSettings?: boolean;
    includeBillingSettings?: boolean;
    billingManagementAvailable?: boolean;
    desktopBillingHandoff?: boolean;
}) {
    const [query, setQuery] = React.useState('');
    const t = useTranslations('DoryUI.Settings');
    const categories = React.useMemo(() => getCategories(t, { includeOrganizationSettings, includeBillingSettings }), [t, includeOrganizationSettings, includeBillingSettings]);

    React.useEffect(() => {
        if (open) {
            setQuery('');
        }
    }, [open, activeCategory]);

    const resolvedActiveCategory = React.useMemo(() => {
        return categories.some(category => category.key === activeCategory) ? activeCategory : (categories[0]?.key ?? 'appearance');
    }, [activeCategory, categories]);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return categories;
        return categories.filter(c => c.label.toLowerCase().includes(q) || (c.tag ?? '').toLowerCase().includes(q));
    }, [categories, query]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn('p-0 gap-0 overflow-hidden', 'sm:max-w-[1080px] w-[1080px] h-[680px] min-h-0', 'rounded-2xl')}>
                <div className="grid h-full min-h-0 overflow-hidden grid-cols-[280px_minmax(0,1fr)]">
                    <SettingsSidebar
                        active={resolvedActiveCategory}
                        query={query}
                        onQueryChange={setQuery}
                        onSelect={onActiveCategoryChange ?? (() => undefined)}
                        filtered={filtered}
                    />
                    <SettingsContent
                        active={resolvedActiveCategory}
                        categories={categories}
                        billingManagementAvailable={billingManagementAvailable}
                        desktopBillingHandoff={desktopBillingHandoff}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
