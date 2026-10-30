'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

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
export function ReportMultiSelect({ value, onValueChange, options }: { value: string[]; onValueChange: (value: string[]) => void; options: string[] }) {
    return (
        <div className="max-h-36 space-y-2 overflow-auto rounded-md border bg-background p-3">
            {options.map(option => (
                <label key={option} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={value.includes(option)} onCheckedChange={checked => onValueChange(checked ? [...value, option] : value.filter(item => item !== option))} />
                    {option}
                </label>
            ))}
        </div>
    );
}
