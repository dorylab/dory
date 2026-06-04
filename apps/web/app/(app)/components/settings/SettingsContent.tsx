'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { MonitorCog } from 'lucide-react';
import { DialogTitle, DialogDescription } from '@/registry/new-york-v4/ui/dialog';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import type { CategoryKey } from './types';
import { PanelByKey } from './PanelByKey';
import { SettingsHeaderActionContext, SettingsPanelActionSlot } from './settings-header-action';

export function SettingsContent({
    active,
    categories,
    runtime,
    billingManagementAvailable,
    desktopBillingHandoff,
}: {
    active: CategoryKey;
    categories: Array<{ key: CategoryKey; icon: ElementType; title: string; description?: string }>;
    runtime?: string | null;
    billingManagementAvailable: boolean;
    desktopBillingHandoff: boolean;
}) {
    const t = useTranslations('DoryUI.Settings');
    const meta = categories.find(category => category.key === active);
    const TitleIcon = meta?.icon ?? MonitorCog;
    const [headerAction, setHeaderAction] = useState<ReactNode>(null);
    const headerActionContext = useMemo(() => ({ setHeaderAction }), []);

    useEffect(() => {
        setHeaderAction(null);
    }, [active]);

    return (
        <SettingsHeaderActionContext.Provider value={headerActionContext}>
            <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5">
                    <div className="min-w-0 pr-16">
                        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                            <TitleIcon className="h-4 w-4" />
                            {meta?.title ?? t('Title')}
                        </DialogTitle>
                        <DialogDescription className={meta?.description ? 'mt-1 min-w-0 text-sm text-muted-foreground' : 'sr-only'}>
                            {meta?.description ?? t('Description')}
                        </DialogDescription>
                    </div>
                </div>
                <SettingsPanelActionSlot>{headerAction}</SettingsPanelActionSlot>
                <Separator className="my-4 shrink-0" />
                <ScrollArea className="h-0 min-h-0 flex-1">
                    <div className="px-6 pb-6">
                        <PanelByKey keyName={active} runtime={runtime} billingManagementAvailable={billingManagementAvailable} desktopBillingHandoff={desktopBillingHandoff} />
                    </div>
                </ScrollArea>
            </section>
        </SettingsHeaderActionContext.Provider>
    );
}
