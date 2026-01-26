'use client';

import { useMemo, useState } from 'react';
import { Database, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { useTranslations } from 'next-intl';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';

type Props = {
    value: string;
    databases: Array<{ value: string; label: string }>;
    onChange: (id: string) => void;
    className?: string;
};

export function DatabasesSelect({ value, databases, onChange, className }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const t = useTranslations('SchemaSidebar');

    const selected = useMemo(() => databases.find(d => d.value === value) || null, [databases, value]);

    const filtered = useMemo(() => {
        if (!query.trim()) return databases;
        const q = query.toLowerCase();
        
        return databases.filter(d => d.label.toLowerCase().includes(q) || d?.value?.toLowerCase().includes(q));
    }, [databases, query]);

    const handleSelect = (val: string) => {
        onChange(val);
        setOpen(false);
    };

    return (
        <TooltipProvider>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={open} className={cn('w-full h-8 justify-between', className)}>
                        <span className="flex items-center gap-2 min-w-0">
                            <Database className="h-4 w-4 shrink-0" />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="truncate text-sm max-w-[220px]">{selected ? selected.label : t('Select database')}</span>
                                </TooltipTrigger>
                                <TooltipContent side="right">{selected ? selected.label : t('Select database')}</TooltipContent>
                            </Tooltip>
                        </span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent align="start" className="p-0 w-80">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t('Search databases')}
                            value={query}
                            onValueChange={setQuery}
                            
                            className="h-9"
                        />
                        <CommandList className="max-h-64">
                            <CommandEmpty>{t('No results')}</CommandEmpty>
                            <CommandGroup heading={t('Databases')}>
                                {filtered.map(db => (
                                    <CommandItem key={db.value} value={db.value} onSelect={handleSelect} className="flex items-center gap-2">
                                        <Database className="h-4 w-4 shrink-0" />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="text-sm truncate max-w-[200px]">{db.label}</span>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">{db.label}</TooltipContent>
                                        </Tooltip>
                                        <Check className={cn('ml-auto h-4 w-4', value === db.value ? 'opacity-100' : 'opacity-0')} />
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
