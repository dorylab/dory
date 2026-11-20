'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { getDatabaseTypeMeta } from '@/app/(app)/[organization]/connections/components/database-type-icon';
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/registry/new-york-v4/ui/avatar';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import type { KnowledgeModelView } from './knowledge-page.client';

type DataSource = KnowledgeModelView['dataSources'][number];

function SourceAvatar({ source }: { source: DataSource }) {
    const { src, label } = getDatabaseTypeMeta(source.type);
    return (
        <Avatar className="border bg-background">
            {src && <AvatarImage src={src} alt={label} className="object-contain p-1.5" />}
            <AvatarFallback>
                {Array.from(label || source.name)
                    .slice(0, 2)
                    .join('')
                    .toLocaleUpperCase()}
            </AvatarFallback>
        </Avatar>
    );
}

export function KnowledgeDataSourceAvatars({ sources }: { sources: DataSource[] }) {
    const t = useTranslations('Knowledge');
    const [open, setOpen] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(closeTimer.current), []);

    function show() {
        clearTimeout(closeTimer.current);
        setOpen(true);
    }
    function scheduleClose() {
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setOpen(false), 180);
    }

    if (!sources.length) return null;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={sources.map(source => source.name).join(' · ')}
                    className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onPointerEnter={event => {
                        if (event.pointerType === 'mouse') show();
                    }}
                    onPointerLeave={event => {
                        if (event.pointerType === 'mouse') scheduleClose();
                    }}
                    onFocus={event => {
                        if (event.currentTarget.matches(':focus-visible')) show();
                    }}
                >
                    <AvatarGroup aria-hidden="true">
                        {sources.slice(0, 3).map(source => (
                            <Avatar key={source.connectionId}>
                                <AvatarFallback>{Array.from(source.name.trim().normalize())[0]?.toUpperCase() || '?'}</AvatarFallback>
                            </Avatar>
                        ))}
                        {sources.length > 3 && <AvatarGroupCount>+{sources.length - 3}</AvatarGroupCount>}
                    </AvatarGroup>
                </button>
            </PopoverTrigger>
            <PopoverContent
                aria-label={t('ConnectedTo')}
                align="start"
                className="w-fit max-w-[min(22rem,calc(100vw-2rem))] p-3"
                onOpenAutoFocus={event => event.preventDefault()}
                onCloseAutoFocus={event => event.preventDefault()}
                onPointerEnter={() => clearTimeout(closeTimer.current)}
                onPointerLeave={event => {
                    if (event.pointerType === 'mouse') scheduleClose();
                }}
            >
                <PopoverTitle className="mb-2 text-xs text-muted-foreground">{t('ConnectedTo')}</PopoverTitle>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                    {sources.map(source => (
                        <li key={source.connectionId} className="flex items-center gap-2">
                            <SourceAvatar source={source} />
                            <div className="min-w-0">
                                <div className="wrap-anywhere text-sm font-medium">{source.name}</div>
                                <div className="text-xs text-muted-foreground">{getDatabaseTypeMeta(source.type).label}</div>
                            </div>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}
