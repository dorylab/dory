'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { useTranslations } from 'next-intl';

import { SearchableSelect } from '@/components/@dory/ui/searchable-select';

export function ReportSelect({
    value,
    disabled,
    onValueChange,
    children,
    className,
    'aria-label': label,
}: {
    value: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
}) {
    return (
        <Select disabled={disabled} value={value || '__none'} onValueChange={value => onValueChange(value === '__none' ? '' : value)}>
            <SelectTrigger className={className} aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>{children}</SelectContent>
        </Select>
    );
}
export function ReportColumnSelect({ label, ...props }: ComponentProps<typeof SearchableSelect> & { label: string }) {
    const t = useTranslations('WorkDocuments.Report');
    const id = useId();
    return (
        <div className="min-w-0">
            <label htmlFor={id} className="block text-sm">
                {label}
            </label>
            <SearchableSelect
                {...props}
                id={id}
                searchPlaceholder={t('FindColumns')}
                triggerSize="default"
                popoverClassName="w-64 max-w-(--radix-popover-content-available-width)"
            />
        </div>
    );
}
