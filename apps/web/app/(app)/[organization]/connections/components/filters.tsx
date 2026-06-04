'use client';

import { CircleOff, Code2, Filter, FlaskConical, Rocket, User, Users, X } from 'lucide-react';
import { useAtom } from 'jotai';
import { useTranslations } from 'next-intl';

import { Button } from '@/registry/new-york-v4/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { cn } from '@dory/web-utils';
import { CONNECTION_ENVIRONMENT_OPTIONS, CONNECTION_TAG_COLOR_OPTIONS } from '../constants';
import type { ConnectionEnvironmentValue, ConnectionTagColorValue } from '../constants';
import { connectionEnvironmentFilterAtom, connectionTagFilterAtom } from '../states';

const ENVIRONMENT_FILTER_ICONS = {
    '': CircleOff,
    dev: Code2,
    staging: FlaskConical,
    prod: Rocket,
    personal: User,
    shared: Users,
} satisfies Record<ConnectionEnvironmentValue, typeof CircleOff>;

function toggleFilterValue<TValue extends string>(values: TValue[], value: TValue, checked: boolean) {
    if (checked) {
        return values.includes(value) ? values : [...values, value];
    }
    return values.filter(item => item !== value);
}

export function ConnectionFilters() {
    const t = useTranslations('Connections');
    const [environmentFilters, setEnvironmentFilters] = useAtom(connectionEnvironmentFilterAtom);
    const [tagFilters, setTagFilters] = useAtom(connectionTagFilterAtom);

    const selectedCount = environmentFilters.length + tagFilters.length;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant={selectedCount ? 'default' : 'outline'} className="h-9 shrink-0 cursor-pointer gap-2 px-3" aria-label={t('Filters.Label')}>
                    <Filter className="h-4 w-4" />
                    <span>{t('Filters.Label')}</span>
                    {selectedCount ? <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs">{selectedCount}</span> : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>{t('Environment')}</DropdownMenuLabel>
                {CONNECTION_ENVIRONMENT_OPTIONS.map(option => {
                    const Icon = ENVIRONMENT_FILTER_ICONS[option.value];

                    return (
                        <DropdownMenuCheckboxItem
                            key={option.value || 'none'}
                            checked={environmentFilters.includes(option.value)}
                            onCheckedChange={checked => {
                                setEnvironmentFilters(current => toggleFilterValue<ConnectionEnvironmentValue>(current, option.value, Boolean(checked)));
                            }}
                            onSelect={event => event.preventDefault()}
                        >
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {t(option.translationKey)}
                        </DropdownMenuCheckboxItem>
                    );
                })}

                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('Tag')}</DropdownMenuLabel>
                {CONNECTION_TAG_COLOR_OPTIONS.map(option => (
                    <DropdownMenuCheckboxItem
                        key={option.value || 'none'}
                        checked={tagFilters.includes(option.value)}
                        onCheckedChange={checked => {
                            setTagFilters(current => toggleFilterValue<ConnectionTagColorValue>(current, option.value, Boolean(checked)));
                        }}
                        onSelect={event => event.preventDefault()}
                    >
                        <span className={cn('h-2.5 w-2.5 rounded-full border', option.value ? option.swatchClassName : 'bg-background')} />
                        {t(option.translationKey)}
                    </DropdownMenuCheckboxItem>
                ))}

                {selectedCount ? (
                    <>
                        <DropdownMenuSeparator />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-full cursor-pointer justify-start gap-2 px-2"
                            onClick={() => {
                                setEnvironmentFilters([]);
                                setTagFilters([]);
                            }}
                        >
                            <X className="h-4 w-4" />
                            {t('Filters.Clear')}
                        </Button>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
