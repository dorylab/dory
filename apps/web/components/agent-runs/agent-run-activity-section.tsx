'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';
import { AgentRunActivityTimeline } from '@/components/agent-runs/agent-run-activity-timeline';
import type { AgentRunTimelineItem } from '@/lib/agent-runs/summary';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';

export function AgentRunActivitySection({ items, summary }: { items: AgentRunTimelineItem[]; summary: string }) {
    const t = useTranslations('AgentRuns');
    const [open, setOpen] = useState(false);

    return (
        <Collapsible open={open} onOpenChange={setOpen} asChild>
            <section className="grid gap-3">
                <div className="grid gap-1">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="-ml-2 h-7 w-fit shrink-0 gap-1.5 px-2" aria-label={open ? t('Actions.Collapse') : t('Actions.Expand')}>
                            <h2 className="text-base font-semibold">{t('Activity.Title')}</h2>
                            <span aria-hidden="true">
                                <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
                            </span>
                        </Button>
                    </CollapsibleTrigger>
                    <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
                <CollapsibleContent className="data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                    <AgentRunActivityTimeline items={items} />
                </CollapsibleContent>
            </section>
        </Collapsible>
    );
}
