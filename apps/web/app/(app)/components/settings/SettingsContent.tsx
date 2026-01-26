import { DialogTitle, DialogDescription } from '@/registry/new-york-v4/ui/dialog';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { MonitorCog } from 'lucide-react';
import type { CategoryKey } from './types';
import { CATEGORIES } from './types';
import { PanelByKey } from './PanelByKey';

export function SettingsContent({ active }: { active: CategoryKey }) {
    const meta = CATEGORIES.find(category => category.key === active);
    const TitleIcon = meta?.icon ?? MonitorCog;

    return (
        <section className="h-full">
            <div className="px-6 pt-5">
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                    <TitleIcon className="h-4 w-4" />
                    {meta?.title ?? 'Settings'}
                </DialogTitle>
                <DialogDescription className={meta?.description ? 'text-sm text-muted-foreground mt-1' : 'sr-only'}>
                    {meta?.description ?? 'Application settings'}
                </DialogDescription>
            </div>
            <Separator className="my-4" />
            <ScrollArea className="h-[calc(600px-64px)] px-6 pb-6">
                <PanelByKey keyName={active} />
            </ScrollArea>
        </section>
    );
}
