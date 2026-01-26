'use client';

import { useMemo } from 'react';
import { Database } from 'lucide-react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { SearchableSelect, SelectOption } from '../searchable-select';
import { useTranslations } from 'next-intl';


type Props = {
    value: string;
    databases: Array<{ value: string; label: string }>;
    onChange: (id: string) => void;
    className?: string;
};

export function DatabasesSelect({ value, databases, onChange, className }: Props) {
    const t = useTranslations('DoryUI');
    const options: SelectOption[] = useMemo(
        () =>
            databases.map(db => ({
                value: db.value,
                label: db.label,
            })),
        [databases],
    );

    return (
        <SearchableSelect
            value={value}
            options={options}
            onChange={onChange}
            icon={Database}
            enableAll
            allLabel={t('DatabaseSelect.All')}
            allValue="all"
            placeholder={t('DatabaseSelect.Placeholder')}
            emptyText={t('DatabaseSelect.Empty')}
            groupLabel={t('DatabaseSelect.GroupLabel')}
            className={cn(className)}
        />
    );
}
