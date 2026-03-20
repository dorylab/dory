'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Layers3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import type { SidebarOption } from './types';

type SchemaSelectProps = {
    value: string;
    schemas: SidebarOption[];
    onChange: (schema: string) => void;
};

export function SchemaSelect({ value, schemas, onChange }: SchemaSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const t = useTranslations('SQLConsoleSidebar');

    const selected = useMemo(() => schemas.find(schema => schema.value === value) ?? null, [schemas, value]);

    const filtered = useMemo(() => {
        if (!query.trim()) return schemas;
        const normalizedQuery = query.toLowerCase();
        return schemas.filter(schema => schema.label.toLowerCase().includes(normalizedQuery) || schema.value.toLowerCase().includes(normalizedQuery));
    }, [query, schemas]);

    if (schemas.length === 0) {
        return null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="h-8 w-full justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                        <Layers3 className="h-4 w-4 shrink-0" />
                        <span className="truncate text-sm">{selected?.label ?? t('Select schema')}</span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-80 p-0">
                <Command shouldFilter={false}>
                    <CommandInput placeholder={t('Search schemas')} value={query} onValueChange={setQuery} className="h-9" />
                    <CommandList className="max-h-64">
                        <CommandEmpty>{t('No results')}</CommandEmpty>
                        <CommandGroup heading={t('Schemas')}>
                            {filtered.map(schema => (
                                <CommandItem
                                    key={schema.value}
                                    value={schema.value}
                                    onSelect={nextValue => {
                                        onChange(nextValue);
                                        setOpen(false);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Layers3 className="h-4 w-4 shrink-0" />
                                    <span className="truncate text-sm">{schema.label}</span>
                                    <Check className={cn('ml-auto h-4 w-4', value === schema.value ? 'opacity-100' : 'opacity-0')} />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
