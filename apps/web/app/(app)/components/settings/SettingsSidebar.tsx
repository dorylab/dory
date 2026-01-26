import type { ElementType } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Search, ChevronRight } from 'lucide-react';
import type { CategoryKey } from './types';

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
    filtered: Array<{ key: CategoryKey; label: string; icon: ElementType; tag?: string }>;
}) {
    return (
        <aside className="border-r bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="p-3">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Search settings" className="pl-8 h-8" />
                </div>
            </div>
            <ScrollArea className="h-[calc(600px-56px)]">
                <div className="px-2 py-1">
                    {filtered.map(({ key, label, icon: Icon, tag }) => {
                        const activeItem = active === key;
                        return (
                            <button
                                key={key}
                                onClick={() => onSelect(key)}
                                className={cn(
                                    'relative w-full flex items-center justify-between px-3 py-2 rounded-lg',
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
            </ScrollArea>
        </aside>
    );
}
