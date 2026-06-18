'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@dory/web-utils';
import { AgentRunActivityTimeline } from '@/components/agent-runs/agent-run-activity-timeline';
import type { AgentRunTimelineItem } from '@/lib/agent-runs/summary';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';

export function AgentRunActivitySection({ items }: { items: AgentRunTimelineItem[] }) {
    const [open, setOpen] = useState(true);

    return (
        <Collapsible open={open} onOpenChange={setOpen} asChild>
            <section className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold">Activity</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Readable timeline first. Raw tool details are available inside each item.</p>
                    </div>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0 gap-1">
                            {open ? 'Collapse' : 'Expand'}
                            <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                    <AgentRunActivityTimeline items={items} />
                </CollapsibleContent>
            </section>
        </Collapsible>
    );
}
