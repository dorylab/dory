'use client';

import { useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { type FieldValues, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/registry/new-york-v4/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';

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

export function CertificateField({ form, label, sourceName, pathName, contentName, hasContentName }: CertificateFieldProps) {
    const source = form.watch(sourceName);
    const pathValue = form.watch(pathName);
    const hasContent = Boolean(form.watch(hasContentName));
    const contentValue = form.watch(contentName);
    const canPickFile = typeof window !== 'undefined' && typeof window.electron?.selectLocalFile === 'function';
    const preservesSavedContent = source === 'content' && hasContent && !hasText(pathValue) && !hasText(contentValue);

    useEffect(() => {
        if (source === 'path' || preservesSavedContent) return;
        form.setValue(sourceName, 'path', { shouldDirty: false, shouldValidate: false });
    }, [form, preservesSavedContent, source, sourceName]);

    return (
        <FormField
            control={form.control}
            name={pathName}
            render={({ field }) => (
                <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium">{label}</FormLabel>
                    <FormControl>
                        <div className="flex gap-2">
                            <Input
                                placeholder="/path/to/certificate.pem"
                                {...field}
                                value={field.value ?? ''}
                                onChange={event => {
                                    form.setValue(sourceName, 'path', { shouldDirty: true, shouldValidate: false });
                                    field.onChange(event);
                                }}
                            />
                            {canPickFile ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={async () => {
                                        const selectedPath = await window.electron?.selectLocalFile?.();
                                        if (!selectedPath) return;
                                        form.setValue(sourceName, 'path', { shouldDirty: true, shouldValidate: false });
                                        form.setValue(pathName, selectedPath, { shouldDirty: true, shouldValidate: true });
                                    }}
                                >
                                    <FolderOpen className="h-4 w-4" />
                                    Browse
                                </Button>
                            ) : null}
                        </div>
                    </FormControl>
                    {preservesSavedContent ? <span className="text-xs text-muted-foreground">Saved content will be reused until a path is selected.</span> : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
