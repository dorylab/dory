'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';

export type ComboboxSubmenuOption = {
    value: string;
    label: string;
    keywords?: string[];
};

export type ComboboxSubmenuGroup = {
    value: string;
    label: string;
    keywords?: string[];
    children: ComboboxSubmenuOption[];
};

type ComboboxSubmenuSelection = {
    value: string;
    label: string;
    groupValue?: string;
    groupLabel?: string;
};

type ComboboxSubmenuProps = {
    label?: string;
    value: string;
    selectedLabel?: string;
    standaloneOptions?: ComboboxSubmenuOption[];
    groupOptions?: ComboboxSubmenuGroup[];
    onValueChange: (value: string, selection: ComboboxSubmenuSelection) => void;
    disabled?: boolean;
    triggerPlaceholder?: string;
    searchPlaceholder?: string;
    leftEmptyText?: string;
    rightEmptyText?: string;
    rightPlaceholderText?: string;
    triggerClassName?: string;
    popoverClassName?: string;
};

type LeftEntry = { type: 'standalone'; option: ComboboxSubmenuOption } | { type: 'group'; group: ComboboxSubmenuGroup };

function matchesQuery(option: { label: string; value: string; keywords?: string[] }, query: string) {
    if (!query) {
        return true;
    }

    const normalizedQuery = query.toLowerCase();
    if (option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery)) {
        return true;
    }

    return option.keywords?.some(keyword => keyword.toLowerCase().includes(normalizedQuery)) ?? false;
}

export function ComboboxSubmenu({
    label,
    value,
    selectedLabel,
    standaloneOptions = [],
    groupOptions = [],
    onValueChange,
    disabled = false,
    triggerPlaceholder = 'Select',
    searchPlaceholder = 'Search...',
    leftEmptyText = 'No matching fields.',
    rightEmptyText = 'No matching options.',
    rightPlaceholderText = 'Choose an item.',
    triggerClassName,
    popoverClassName,
}: ComboboxSubmenuProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [focusPane, setFocusPane] = useState<'left' | 'right'>('left');
    const [leftIndex, setLeftIndex] = useState(0);
    const [rightIndex, setRightIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const leftItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const rightItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const normalizedQuery = query.trim().toLowerCase();

    const filteredStandaloneOptions = useMemo(() => standaloneOptions.filter(option => matchesQuery(option, normalizedQuery)), [normalizedQuery, standaloneOptions]);

    const filteredGroupOptions = useMemo(
        () =>
            groupOptions
                .map(group => {
                    const filteredChildren = group.children.filter(child => matchesQuery(child, normalizedQuery));
                    const groupMatches = matchesQuery(group, normalizedQuery);

                    if (!groupMatches && filteredChildren.length === 0) {
                        return null;
                    }

                    return {
                        ...group,
                        children: groupMatches && !normalizedQuery ? group.children : filteredChildren,
                    };
                })
                .filter((group): group is ComboboxSubmenuGroup => Boolean(group)),
        [groupOptions, normalizedQuery],
    );

    const leftEntries = useMemo<LeftEntry[]>(
        () => [...filteredStandaloneOptions.map(option => ({ type: 'standalone' as const, option })), ...filteredGroupOptions.map(group => ({ type: 'group' as const, group }))],
        [filteredGroupOptions, filteredStandaloneOptions],
    );

    const activeLeftEntry = leftEntries[leftIndex] ?? null;
    const rightOptions = activeLeftEntry?.type === 'group' ? activeLeftEntry.group.children : [];

    const selectedStandaloneOption = standaloneOptions.find(option => option.value === value) ?? null;
    const selectedGroup = groupOptions.find(group => group.children.some(child => child.value === value)) ?? null;
    const selectedChildOption = selectedGroup?.children?.find(child => child.value === value) ?? null;
    const resolvedSelectedLabel = selectedLabel ?? selectedStandaloneOption?.label ?? selectedChildOption?.label ?? triggerPlaceholder;

    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => searchInputRef.current?.focus());
            return;
        }

        setQuery('');
        setFocusPane('left');
        setLeftIndex(0);
        setRightIndex(0);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (leftEntries.length === 0) {
            setLeftIndex(0);
            return;
        }

        setLeftIndex(previous => Math.min(previous, leftEntries.length - 1));
    }, [leftEntries.length, open]);

    useEffect(() => {
        if (!open) return;

        setRightIndex(0);
        if (focusPane === 'right' && rightOptions.length === 0) {
            setFocusPane('left');
        }
    }, [activeLeftEntry, focusPane, open, rightOptions.length]);

    useEffect(() => {
        if (!open || focusPane !== 'left') return;
        leftItemRefs.current[leftIndex]?.scrollIntoView({ block: 'nearest' });
    }, [focusPane, leftIndex, open]);

    useEffect(() => {
        if (!open || focusPane !== 'right') return;
        rightItemRefs.current[rightIndex]?.scrollIntoView({ block: 'nearest' });
    }, [focusPane, open, rightIndex]);

    const selectOption = useCallback(
        (option: ComboboxSubmenuOption, group?: ComboboxSubmenuGroup) => {
            onValueChange(option.value, {
                value: option.value,
                label: option.label,
                groupValue: group?.value,
                groupLabel: group?.label,
            });
            setOpen(false);
        },
        [onValueChange],
    );

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (focusPane === 'left') {
                setLeftIndex(previous => {
                    if (leftEntries.length === 0) return 0;
                    return Math.min(previous + 1, leftEntries.length - 1);
                });
            } else {
                setRightIndex(previous => {
                    if (rightOptions.length === 0) return 0;
                    return Math.min(previous + 1, rightOptions.length - 1);
                });
            }
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (focusPane === 'left') {
                setLeftIndex(previous => Math.max(previous - 1, 0));
            } else {
                setRightIndex(previous => Math.max(previous - 1, 0));
            }
            return;
        }

        if (event.key === 'ArrowRight') {
            if (focusPane === 'left' && activeLeftEntry?.type === 'group' && rightOptions.length > 0) {
                event.preventDefault();
                setFocusPane('right');
                setRightIndex(0);
            }
            return;
        }

        if (event.key === 'ArrowLeft') {
            if (focusPane === 'right') {
                event.preventDefault();
                setFocusPane('left');
            }
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();

            if (focusPane === 'left') {
                if (activeLeftEntry?.type === 'standalone') {
                    selectOption(activeLeftEntry.option);
                } else if (activeLeftEntry?.type === 'group' && rightOptions.length > 0) {
                    setFocusPane('right');
                    setRightIndex(0);
                }
                return;
            }

            const option = rightOptions[rightIndex];
            if (option && activeLeftEntry?.type === 'group') {
                selectOption(option, activeLeftEntry.group);
            }
        }
    };

    return (
        <div className="flex shrink-0 items-center gap-1">
            {label ? <span className="mr-1 text-[11px] font-medium text-muted-foreground/80">{label}</span> : null}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="control"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className={cn('min-w-[104px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70', triggerClassName)}
                    >
                        <span className="truncate">{resolvedSelectedLabel}</span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-80" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className={cn('w-[360px] p-0', popoverClassName)}>
                    <div className="grid h-64 grid-cols-2 overflow-hidden">
                        <div className="flex min-h-0 flex-col border-r">
                            <div className="border-b p-2">
                                <input
                                    ref={searchInputRef}
                                    value={query}
                                    onChange={event => {
                                        setQuery(event.target.value);
                                        setFocusPane('left');
                                        setLeftIndex(0);
                                    }}
                                    onKeyDown={handleSearchKeyDown}
                                    placeholder={searchPlaceholder}
                                    className="h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                                />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-1">
                                {filteredStandaloneOptions.map((option, index) => {
                                    const isActive = focusPane === 'left' && leftIndex === index;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            ref={element => {
                                                leftItemRefs.current[index] = element;
                                            }}
                                            className={cn(
                                                'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs',
                                                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
                                            )}
                                            onMouseEnter={() => {
                                                setFocusPane('left');
                                                setLeftIndex(index);
                                            }}
                                            onClick={() => selectOption(option)}
                                        >
                                            <span className="truncate">{option.label}</span>
                                        </button>
                                    );
                                })}
                                {filteredStandaloneOptions.length > 0 && filteredGroupOptions.length > 0 ? <div className="my-1 h-px bg-border" /> : null}
                                {filteredGroupOptions.length === 0 && filteredStandaloneOptions.length === 0 ? (
                                    <div className="px-2 py-3 text-xs text-muted-foreground">{leftEmptyText}</div>
                                ) : (
                                    filteredGroupOptions.map((group, index) => {
                                        const entryIndex = filteredStandaloneOptions.length + index;
                                        const isSelectedGroup = group.children.some(option => option.value === value);
                                        const isActive = (focusPane === 'left' && leftIndex === entryIndex) || isSelectedGroup;
                                        return (
                                            <button
                                                key={group.value}
                                                type="button"
                                                ref={element => {
                                                    leftItemRefs.current[entryIndex] = element;
                                                }}
                                                onMouseEnter={() => {
                                                    setFocusPane('left');
                                                    setLeftIndex(entryIndex);
                                                }}
                                                onFocus={() => {
                                                    setFocusPane('left');
                                                    setLeftIndex(entryIndex);
                                                }}
                                                onClick={() => {
                                                    setFocusPane('right');
                                                    setLeftIndex(entryIndex);
                                                    setRightIndex(0);
                                                }}
                                                className={cn(
                                                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs',
                                                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
                                                )}
                                            >
                                                <span className="truncate">{group.label}</span>
                                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-1">
                            {activeLeftEntry?.type !== 'group' ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground">{rightPlaceholderText}</div>
                            ) : rightOptions.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground">{rightEmptyText}</div>
                            ) : (
                                rightOptions.map((option, index) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        ref={element => {
                                            rightItemRefs.current[index] = element;
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent',
                                            option.value === value && 'bg-accent',
                                            focusPane === 'right' && rightIndex === index && 'bg-accent text-accent-foreground',
                                        )}
                                        onMouseEnter={() => {
                                            setFocusPane('right');
                                            setRightIndex(index);
                                        }}
                                        onClick={() => selectOption(option, activeLeftEntry.group)}
                                    >
                                        <span className="truncate">{option.label}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
