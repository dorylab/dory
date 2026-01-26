'use client';

import { useMemo } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { SearchableSelect, type SelectOption } from '../searchable-select';
import { useTranslations } from 'next-intl';

type Props = {
    value: string; // 当前选中的用户名（'' 表示所有用户）
    users: string[]; // 用户名列表
    onChange: (user: string) => void;
    className?: string;
};

export function DatabaseUsersSelect({ value, users, onChange, className }: Props) {
    const t = useTranslations('DoryUI');
    const options: SelectOption[] = useMemo(
        () =>
            users.map(u => ({
                value: u,
                label: u,
            })),
        [users],
    );

    return (
        <SearchableSelect
            value={value}
            options={options}
            onChange={onChange}
            icon={User}
            enableAll
            allLabel={t('DatabaseUserSelect.All')}
            allValue="all"
            placeholder={t('DatabaseUserSelect.Placeholder')}
            emptyText={t('DatabaseUserSelect.Empty')}
            groupLabel={t('DatabaseUserSelect.GroupLabel')}
            className={cn(className)}
        />
    );
}
