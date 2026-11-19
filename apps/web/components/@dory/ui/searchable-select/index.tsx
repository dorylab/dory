'use client';

import * as React from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { useTranslations } from 'next-intl';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { selectTriggerVariants } from '@/registry/new-york-v4/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';

export type SelectOption = {
    value: string;
    label: string;
};

type SearchableSelectProps = {
    options: SelectOption[];
    id?: string;
    disabled?: boolean;
    modal?: boolean;
    selectedLabel?: string;
    search?: { value: string; onChange: (value: string) => void };
    searchPlaceholder?: string;

    placeholder?: string;
    emptyText?: string;
    groupLabel?: string;

    enableAll?: boolean;
    allLabel?: string;
    allValue?: string;

    icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    className?: string;
    popoverClassName?: string;
    triggerSize?: 'sm' | 'default' | 'control';
} & ({ multiple?: false; value: string; onChange: (value: string) => void } | { multiple: true; value: string[]; onChange: (value: string[]) => void; maxSelected?: number });

export function SearchableSelect({
    options,
    id,
    disabled,
    modal,
    selectedLabel,
    search,
    searchPlaceholder,
    placeholder,
    emptyText,
    groupLabel,
    enableAll = false,
    allLabel,
    allValue = '',
    icon: Icon,
    className,
    popoverClassName,
    triggerSize = 'sm',
    ...selection
}: SearchableSelectProps) {
    const t = useTranslations('DoryUI');
    const resolvedPlaceholder = placeholder ?? t('Select.Placeholder');
    const resolvedEmptyText = emptyText ?? t('Select.Empty');
    const resolvedAllLabel = allLabel ?? t('Select.All');
    const resolvedSearchPlaceholder = searchPlaceholder ?? t('Select.SearchPlaceholder');
    const popoverId = React.useId();
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');

    const { value } = selection;
    const selected = selection.multiple ? selection.value : [selection.value];
    const isAllSelected = enableAll && !selection.multiple && (value === allValue || value === '');
    const displayLabel = isAllSelected
        ? resolvedAllLabel
        : selected
              .map(key => options.find(option => option.value === key)?.label ?? (selection.multiple ? key : ''))
              .filter(Boolean)
              .join(', ') ||
          selectedLabel ||
          resolvedPlaceholder;
    const atLimit = selection.multiple && selected.length >= (selection.maxSelected ?? Infinity);

    const filtered = React.useMemo(() => {
        if (search || !query.trim()) return options;
        const q = query.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
    }, [options, query, search]);

    const handleOpenChange = (open: boolean) => {
        setOpen(open);
        if (!open) (search?.onChange ?? setQuery)('');
    };

    const handleSelect = (val: string) => {
        if (selection.multiple) {
            selection.onChange(selected.includes(val) ? selected.filter(item => item !== val) : [...selected, val]);
            return;
        }
        selection.onChange(enableAll && val === '__ALL__' ? allValue : val);
        handleOpenChange(false);
    };

    return (
        <TooltipProvider>
            <Popover modal={modal} open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        id={id}
                        disabled={disabled}
                        data-slot="select-trigger"
                        data-size={triggerSize}
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={open ? popoverId : undefined}
                        className={cn(selectTriggerVariants({ size: triggerSize }), 'w-full', className)}
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="max-w-55 truncate">{displayLabel}</span>
                                </TooltipTrigger>
                                <TooltipContent side="right">{displayLabel}</TooltipContent>
                            </Tooltip>
                        </span>

                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </button>
                </PopoverTrigger>

                <PopoverContent id={popoverId} aria-label={resolvedSearchPlaceholder} align="start" className={cn('w-80 p-0', popoverClassName)}>
                    <Command shouldFilter={false}>
                        <CommandInput
                            aria-label={resolvedSearchPlaceholder}
                            placeholder={resolvedSearchPlaceholder}
                            value={search?.value ?? query}
                            onValueChange={search?.onChange ?? setQuery}
                            className="h-9"
                        />
                        <CommandList aria-multiselectable={selection.multiple} className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height)-2.25rem))]">
                            <CommandEmpty>{resolvedEmptyText}</CommandEmpty>
                            <CommandGroup heading={groupLabel}>
                                {enableAll && !selection.multiple && (
                                    <CommandItem key="__ALL__" value="__ALL__" onSelect={handleSelect} className="flex items-center gap-2">
                                        <span className="truncate text-sm">{resolvedAllLabel}</span>
                                        <Check className={cn('ml-auto h-4 w-4', isAllSelected ? 'opacity-100' : 'opacity-0')} />
                                    </CommandItem>
                                )}

                                {filtered.map(opt => (
                                    <CommandItem
                                        key={opt.value}
                                        value={opt.value}
                                        onSelect={() => handleSelect(opt.value)}
                                        aria-checked={selection.multiple ? selected.includes(opt.value) : undefined}
                                        disabled={atLimit && !selected.includes(opt.value)}
                                        className="flex items-center gap-2"
                                    >
                                        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="max-w-50 truncate text-sm">{opt.label}</span>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">{opt.label}</TooltipContent>
                                        </Tooltip>
                                        <Check className={cn('ml-auto h-4 w-4', selected.includes(opt.value) ? 'opacity-100' : 'opacity-0')} />
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
