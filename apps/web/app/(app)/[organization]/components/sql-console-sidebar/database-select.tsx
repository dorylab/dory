'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Database, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { SidebarOption } from './types';

type DatabaseSelectProps = {
    value: string;
    databases: SidebarOption[];
    onChange: (database: string) => void;
    className?: string;
    loading?: boolean;
    error?: string | null;
};

export function DatabaseSelect({ value, databases, onChange, className, loading = false, error = null }: DatabaseSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const t = useTranslations('SQLConsoleSidebar');

    const selected = useMemo(() => databases.find(database => database.value === value) ?? null, [databases, value]);

    const filtered = useMemo(() => {
        if (!query.trim()) return databases;
        const normalizedQuery = query.toLowerCase();

        return databases.filter(database => database.label.toLowerCase().includes(normalizedQuery) || database.value.toLowerCase().includes(normalizedQuery));
    }, [databases, query]);

    const handleSelect = (database: string) => {
        onChange(database);
        setOpen(false);
    };

    return (
        <TooltipProvider>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={open} className={cn('h-8 w-full justify-between', className)}>
                        <span className="flex min-w-0 items-center gap-2">
                            <Database className="h-4 w-4 shrink-0" />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="max-w-55 truncate text-sm">{selected ? selected.label : t('Select database')}</span>
                                </TooltipTrigger>
                                <TooltipContent side="right">{selected ? selected.label : t('Select database')}</TooltipContent>
                            </Tooltip>
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent align="start" className="w-80 p-0">
                    <Command shouldFilter={false}>
                        <CommandInput placeholder={t('Search databases')} value={query} onValueChange={setQuery} className="h-9" />
                        <CommandList className="max-h-64">
                            <CommandEmpty>{loading ? t('Loading databases') : error ? t('Failed to load databases') : t('No results')}</CommandEmpty>
                            <CommandGroup heading={t('Databases')}>
                                {loading ? (
                                    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('Loading databases')}
                                    </div>
                                ) : null}
                                {filtered.map(database => (
                                    <CommandItem key={database.value} value={database.value} onSelect={handleSelect} className="flex items-center gap-2">
                                        <Database className="h-4 w-4 shrink-0" />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="max-w-50 truncate text-sm">{database.label}</span>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">{database.label}</TooltipContent>
                                        </Tooltip>
                                        <Check className={cn('ml-auto h-4 w-4', value === database.value ? 'opacity-100' : 'opacity-0')} />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </TooltipProvider>
    );
}
