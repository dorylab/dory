'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/registry/new-york-v4/ui/popover';
import { useTranslations } from 'next-intl';

export function ReportSelectionPopover({ bodyRef, onAdd }: { bodyRef: RefObject<HTMLDivElement | null>; onAdd: (text: string) => void }) {
    const t = useTranslations('WorkDocuments');
    const [selection, setSelection] = useState<{ text: string; anchor: { contextElement: Element; getBoundingClientRect: () => DOMRect } } | null>(null);

    useEffect(() => {
        const update = () => {
            const body = bodyRef.current;
            const selected = window.getSelection();
            if (!body || !selected?.rangeCount || selected.isCollapsed || !body.contains(selected.anchorNode) || !body.contains(selected.focusNode)) {
                setSelection(null);
                return;
            }
            const text = selected.toString().trim();
            const range = selected.getRangeAt(0).cloneRange();
            setSelection(text ? { text, anchor: { contextElement: body, getBoundingClientRect: () => range.getClientRects()[0] ?? range.getBoundingClientRect() } } : null);
        };
        document.addEventListener('selectionchange', update);
        return () => document.removeEventListener('selectionchange', update);
    }, [bodyRef]);

    if (!selection) return null;
    return (
        <Popover open onOpenChange={open => !open && setSelection(null)}>
            <PopoverAnchor virtualRef={{ current: selection.anchor }} />
            <PopoverContent
                side="top"
                sideOffset={6}
                collisionPadding={8}
                hideWhenDetached
                aria-label={t('AddDefinition')}
                className="w-auto p-1"
                onOpenAutoFocus={event => event.preventDefault()}
                onCloseAutoFocus={event => event.preventDefault()}
            >
                <Button variant="ghost" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => onAdd(selection.text)}>
                    {t('AddDefinition')}
                </Button>
            </PopoverContent>
        </Popover>
    );
}
