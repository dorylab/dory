import { cn } from "@/lib/utils";
import { Button } from "@/registry/new-york-v4/ui/button";
import { Popover } from "@/registry/new-york-v4/ui/popover";
import { PopoverContent, PopoverTrigger } from "@radix-ui/react-popover";
import { TableIcon, Loader2Icon, ChevronsUpDown, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';

type TableSelectProps = {
    value: string;
    tables?: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
    loading?: boolean;
};

export function TableSelect({ value, tables, onChange, disabled = false, loading = false }: TableSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const t = useTranslations('Chatbot');

    const safeTables = Array.isArray(tables) ? tables : [];

    const selected = useMemo(() => safeTables.find(table => table.value === value) || null, [safeTables, value]);

    const filtered = useMemo(() => {
        if (!query.trim()) return safeTables;
        const normalized = query.toLowerCase();
        return safeTables.filter(table => {
            const label = (table.label ?? '').toLowerCase();
            const val = (table.value ?? '').toLowerCase();
            return label.includes(normalized) || val.includes(normalized);
        });
    }, [safeTables, query]);

    const handleSelect = (nextValue: string) => {
        setOpen(false);
        setQuery('');
        onChange(nextValue);
    };

    return (
        <Popover open={open} onOpenChange={nextOpen => !disabled && setOpen(nextOpen)}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full h-8 justify-between" disabled={disabled}>
                    <span className="flex items-center gap-2 min-w-0">
                        <TableIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate text-sm max-w-[220px]">
                            {selected ? selected.label : disabled ? t('TableSelect.SelectDatabaseFirst') : t('TableSelect.SelectTable')}
                        </span>
                    </span>
                    <span className="flex items-center gap-1">
                        {loading && <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)] z-30">
                <Command shouldFilter={false}>
                    <CommandInput placeholder={t('TableSelect.SearchTables')} value={query} onValueChange={setQuery} className="h-9" disabled={disabled} />
                    <CommandList className="max-h-64">
                        <CommandEmpty>{t('TableSelect.NoMatches')}</CommandEmpty>
                        <CommandGroup heading={t('TableSelect.GroupHeading')}>
                            {filtered.map(table => (
                                <CommandItem key={table.value} value={table.value} onSelect={currentValue => handleSelect(currentValue)} className="flex items-center gap-2">
                                    <TableIcon className="h-4 w-4 shrink-0" />
                                    <span className="text-sm truncate max-w-[200px]">{table.label}</span>
                                    <Check className={cn('ml-auto h-4 w-4', value === table.value ? 'opacity-100' : 'opacity-0')} />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
