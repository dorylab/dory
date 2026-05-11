'use client';

import { useTranslations } from 'next-intl';
import { DialogTitle, DialogDescription } from '@/registry/new-york-v4/ui/dialog';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { MonitorCog } from 'lucide-react';
import type { CategoryKey } from './types';
import { getCategories } from './types';
import { PanelByKey } from './PanelByKey';

export function SettingsContent({ active }: { active: CategoryKey }) {
    const t = useTranslations('DoryUI.Settings');
    const categories = getCategories(t);
    const meta = categories.find(category => category.key === active);
    const TitleIcon = meta?.icon ?? MonitorCog;

    return (
        <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="shrink-0 px-6 pt-5">
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                    <TitleIcon className="h-4 w-4" />
                    {meta?.title ?? t('Title')}
                </DialogTitle>
                <DialogDescription className={meta?.description ? 'text-sm text-muted-foreground mt-1' : 'sr-only'}>{meta?.description ?? t('Description')}</DialogDescription>
            </div>
            <Separator className="my-4 shrink-0" />
            <ScrollArea className="h-0 min-h-0 flex-1">
                <div className="px-6 pb-6">
                    <PanelByKey keyName={active} />
                </div>
            </ScrollArea>
        </section>
    );
}
