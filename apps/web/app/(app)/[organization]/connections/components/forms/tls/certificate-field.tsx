'use client';

import { useEffect } from 'react';
import { type FieldValues, type UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

export type CertificateFieldProps = {
    form: UseFormReturn<FieldValues>;
    label: string;
    sourceName: string;
    pathName: string;
    contentName: string;
    hasContentName: string;
    placeholder: string;
};

function hasText(value: unknown) {
    return typeof value === 'string' && value.trim() !== '';
}

export function CertificateField({ form, label, sourceName, pathName, contentName, hasContentName, placeholder }: CertificateFieldProps) {
    const source = form.watch(sourceName);
    const pathValue = form.watch(pathName);
    const hasContent = Boolean(form.watch(hasContentName));
    const contentValue = form.watch(contentName);

    useEffect(() => {
        if (source === 'content' || hasText(pathValue)) return;
        form.setValue(sourceName, 'content', { shouldDirty: false, shouldValidate: false });
    }, [form, pathValue, source, sourceName]);

    return (
        <FormField
            control={form.control}
            name={contentName}
            render={({ field }) => (
                <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium">{label}</FormLabel>
                    {hasContent && !contentValue ? <span className="text-xs text-muted-foreground">Saved content will be reused.</span> : null}
                    <FormControl>
                        <Textarea
                            rows={4}
                            placeholder={placeholder}
                            {...field}
                            value={field.value ?? ''}
                            onChange={event => {
                                form.setValue(sourceName, 'content', { shouldDirty: true, shouldValidate: false });
                                field.onChange(event);
                            }}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
