'use client';

import * as React from 'react';
import type { ChangeEvent, KeyboardEvent, TextareaHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Table } from 'lucide-react';

type TableMentionTextareaProps = {
    value: string;
    onChange: (value: string) => void;
    tables: string[];
    children: any;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

export function TableMentionTextarea({ value, onChange, tables, children }: TableMentionTextareaProps) {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const t = useTranslations('Chatbot');

    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [filteredTables, setFilteredTables] = React.useState<string[]>([]);
    const [activeIndex, setActiveIndex] = React.useState(0);

    
    const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

    const closePopover = () => {
        setOpen(false);
        setQuery('');
        setFilteredTables([]);
        setActiveIndex(0);
        itemRefs.current = [];
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        onChange(text);

        const cursor = e.target.selectionStart ?? text.length;
        const before = text.slice(0, cursor);

        
        const match = before.match(/@([\w_]*)$/);

        if (!match) {
            closePopover();
        } else {
            const q = match[1] ?? '';
            setQuery(q);

            const list = q === '' ? tables : tables.filter(name => name.toLowerCase().includes(q.toLowerCase()));
            setFilteredTables(list);
            setActiveIndex(0);
            setOpen(list.length > 0);
            itemRefs.current = [];
        }

        
        const originalOnChange = children.props.onChange as ((e: ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
        originalOnChange?.(e);
    };

    const insertTableName = (name: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const cursor = textarea.selectionStart ?? value.length;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);

        const newBefore = before.replace(/@[\w_]*$/, '@' + name + ' ');
        const nextValue = newBefore + after;

        onChange(nextValue);
        closePopover();

        requestAnimationFrame(() => {
            textarea.focus();
            const pos = newBefore.length;
            textarea.selectionStart = textarea.selectionEnd = pos;
        });
    };

    
    const handleKeyDownCapture = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        
        if (!open) return;

        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setActiveIndex(prev => {
                if (filteredTables.length === 0) return 0;
                const next = (prev + 1) % filteredTables.length;
                const el = itemRefs.current[next];
                el?.scrollIntoView({ block: 'nearest' });
                return next;
            });
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setActiveIndex(prev => {
                if (filteredTables.length === 0) return 0;
                const next = prev === 0 ? filteredTables.length - 1 : prev - 1;
                const el = itemRefs.current[next];
                el?.scrollIntoView({ block: 'nearest' });
                return next;
            });
            return;
        }

        if (e.key === 'Enter') {
            
            if (e.shiftKey) {
                return; 
            }

            
            e.preventDefault();
            e.stopPropagation();
            const target = filteredTables[activeIndex];
            if (target) insertTableName(target);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closePopover();
            return;
        }

        
    };

    
    const childRef = (children as any).ref;
    const setMergedRef = (el: HTMLTextAreaElement | null) => {
        textareaRef.current = el;
        if (typeof childRef === 'function') {
            childRef(el);
        } else if (childRef && typeof childRef === 'object') {
            (childRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }
    };

    
    const clonedTextarea = React.cloneElement(children, {
        ref: setMergedRef,
        onChange: handleChange,
        
        onKeyDownCapture: handleKeyDownCapture,
    });

    return (
        <Popover open={open} onOpenChange={setOpen} modal={false}>
            <PopoverTrigger asChild>{clonedTextarea}</PopoverTrigger>

            {open && filteredTables.length > 0 && (
                <PopoverContent side="top" align="start" className="w-72 p-0" onOpenAutoFocus={event => event.preventDefault()}>
                    <Command shouldFilter={false}>
                        <CommandList className="max-h-60 overflow-y-auto">
                            <CommandGroup heading={t('TableMention.Heading')}>
                                {filteredTables.map((name, index) => (
                                    <div
                                        key={name}
                                        ref={el => {
                                            itemRefs.current[index] = el;
                                        }}
                                        role="option"
                                        
                                        aria-selected={index === activeIndex}
                                        
                                        onMouseDown={e => {
                                            e.preventDefault();
                                            insertTableName(name);
                                        }}
                                        
                                        onMouseEnter={() => setActiveIndex(index)}
                                        className={cn(
                                            'flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground',
                                            index === activeIndex && 'bg-accent text-accent-foreground'
                                        )}
                                    >
                                        <Table className="size-4 text-emerald-600" />
                                        <span className="truncate">{name}</span>
                                    </div>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            )}
        </Popover>
    );
}
