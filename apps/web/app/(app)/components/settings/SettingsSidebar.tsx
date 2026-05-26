'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@dory/web-utils';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Search, ChevronRight } from 'lucide-react';
import type { CategoryGroupKey, CategoryKey, SettingsCategory } from './types';

const groupOrder: CategoryGroupKey[] = ['person', 'workspace', 'about'];

export function SettingsSidebar({
    active,
    query,
    onQueryChange,
    onSelect,
    filtered,
}: {
    active: CategoryKey;
    query: string;
    onQueryChange: (value: string) => void;
    onSelect: (key: CategoryKey) => void;
    filtered: SettingsCategory[];
}) {
    const t = useTranslations('DoryUI.Settings');
    const groups = groupOrder
        .map(group => ({
            group,
            label: t(`Groups.${group === 'person' ? 'Person' : group === 'workspace' ? 'Workspace' : 'About'}`),
            items: filtered.filter(item => item.group === group),
        }))
        .filter(group => group.items.length > 0);

    return (
        <aside className="flex h-full min-h-0 flex-col border-r bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="shrink-0 p-3">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={e => onQueryChange(e.target.value)} placeholder={t('SearchPlaceholder')} className="pl-8 h-8" />
                </div>
            </div>
            <ScrollArea className="h-0 min-h-0 flex-1">
                <div className="px-2 py-1">
                    {groups.map((group, groupIndex) => (
                        <div key={group.group} className={cn('flex flex-col gap-1', groupIndex > 0 ? 'pt-3' : null)}>
                            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</div>
                            {group.items.map(({ key, label, icon: Icon, tag }) => {
                                const activeItem = active === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => onSelect(key)}
                                        className={cn(
                                            'relative flex w-full items-center justify-between rounded-lg px-3 py-2',
                                            activeItem ? 'bg-muted/40 text-foreground' : 'hover:bg-muted/40',
                                        )}
                                    >
                                        {activeItem ? <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" /> : null}
                                        <span className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" />
                                            <span className="text-sm">{label}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            {tag ? (
                                                <Badge variant={activeItem ? 'secondary' : 'outline'} className="h-5 px-1.5">
                                                    {tag}
                                                </Badge>
                                            ) : null}
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </aside>
    );
}
