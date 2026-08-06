import { CircleHelp } from 'lucide-react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Button } from '@/registry/new-york-v4/ui/button';
import { RadioGroup, RadioGroupItem } from '@/registry/new-york-v4/ui/radio-group';
import { useTranslations } from 'next-intl';
import { isDesktopRuntime } from '@dory/shared/runtime';
import { DEFAULT_LOCAL_DATABASE_DIRECTORY, getDefaultLocalDatabaseFileName, type LocalDatabaseSource, type LocalDatabaseType } from './local-database';

export function inferLocalDatabaseTypeFromPath(filePath: string | null | undefined): 'duckdb' | 'sqlite' | null {
    const extension = filePath
        ?.trim()
        .match(/\.([^.\\/]+)$/)?.[1]
        ?.toLowerCase();
    if (extension === 'duckdb') return 'duckdb';
    if (extension === 'sqlite' || extension === 'sqlite3') return 'sqlite';
    return null;
}

export function applySelectedLocalDatabasePath(form: UseFormReturn<any>, selectedPath: string) {
    const inferredType = inferLocalDatabaseTypeFromPath(selectedPath);
    if (inferredType === 'duckdb') {
        form.setValue('connection.type', 'duckdb', { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.duckdbMode', 'local', { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.database', '', { shouldDirty: true, shouldValidate: false });
    } else if (inferredType === 'sqlite') {
        form.setValue('connection.type', 'sqlite', { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.database', 'main', { shouldDirty: true, shouldValidate: false });
    }

    form.setValue('connection.path', selectedPath, {
        shouldDirty: true,
        shouldValidate: true,
    });
    form.setValue('connection.localDatabaseSource', 'existing', {
        shouldDirty: true,
        shouldValidate: false,
    });
}

export function LocalDatabaseFileFields({ form, type, isEditMode = false }: { form: UseFormReturn<any>; type: LocalDatabaseType; isEditMode?: boolean }) {
    const t = useTranslations('Connections.ConnectionContent');
    const watchedSource = useWatch({ control: form.control, name: 'connection.localDatabaseSource' }) as LocalDatabaseSource | undefined;
    const source: LocalDatabaseSource = isEditMode ? 'existing' : watchedSource === 'new' ? 'new' : 'existing';
    const canPickFile = isDesktopRuntime() && typeof window !== 'undefined' && typeof window.electron?.selectSqliteFile === 'function';
    const canPickDirectory = isDesktopRuntime() && typeof window !== 'undefined' && typeof window.electron?.selectDatabaseDirectory === 'function';
    const databaseLabel = type === 'duckdb' ? 'DuckDB' : 'SQLite';

    return (
        <div className="space-y-4">
            {!isEditMode ? (
                <FormField
                    control={form.control}
                    name="connection.localDatabaseSource"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>{t('Database Source')}</FormLabel>
                            <FormControl>
                                <RadioGroup
                                    className="grid gap-3 sm:grid-cols-2"
                                    value={field.value ?? 'existing'}
                                    onValueChange={value => {
                                        field.onChange(value);
                                        if (value === 'new') {
                                            const currentFileName = form.getValues('connection.localDatabaseFileName');
                                            if (!currentFileName) {
                                                form.setValue('connection.localDatabaseFileName', getDefaultLocalDatabaseFileName(type), {
                                                    shouldDirty: true,
                                                    shouldValidate: false,
                                                });
                                            }
                                            if (!form.getValues('connection.localDatabaseDirectory')) {
                                                form.setValue('connection.localDatabaseDirectory', DEFAULT_LOCAL_DATABASE_DIRECTORY, {
                                                    shouldDirty: true,
                                                    shouldValidate: false,
                                                });
                                            }
                                        }
                                        form.clearErrors(['connection.path', 'connection.localDatabaseFileName', 'connection.localDatabaseDirectory']);
                                    }}
                                >
                                    <label
                                        htmlFor={`${type}-database-source-existing`}
                                        className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
                                    >
                                        <RadioGroupItem id={`${type}-database-source-existing`} value="existing" className="mt-0.5" />
                                        <span className="space-y-1">
                                            <span className="block text-sm font-medium">{t('Existing Database File')}</span>
                                            <span className="block text-xs text-muted-foreground">{t('Existing Database File Description')}</span>
                                        </span>
                                    </label>
                                    <label
                                        htmlFor={`${type}-database-source-new`}
                                        className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
                                    >
                                        <RadioGroupItem id={`${type}-database-source-new`} value="new" className="mt-0.5" />
                                        <span className="space-y-1">
                                            <span className="block text-sm font-medium">{t('Create New Database')}</span>
                                            <span className="block text-xs text-muted-foreground">{t('Create New Database Description')}</span>
                                        </span>
                                    </label>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}

            {source === 'existing' ? (
                <FormField
                    control={form.control}
                    name="connection.path"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel className="flex items-center gap-1.5">
                                <span>
                                    {t('Database File')}
                                    <span className="text-destructive"> *</span>
                                </span>
                                <FieldHelp text={t('Existing Database Help', { database: databaseLabel })} />
                            </FormLabel>
                            <div className="flex gap-2">
                                <FormControl>
                                    <Input placeholder={type === 'duckdb' ? '/path/to/database.duckdb' : t('Select File Placeholder')} {...field} value={field.value ?? ''} />
                                </FormControl>
                                {canPickFile ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={async () => {
                                            const selectedPath = await window.electron?.selectSqliteFile?.();
                                            if (selectedPath) applySelectedLocalDatabasePath(form, selectedPath);
                                        }}
                                    >
                                        {t('Choose')}
                                    </Button>
                                ) : null}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                    <FormField
                        control={form.control}
                        name="connection.localDatabaseFileName"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel>
                                    {t('File Name')}
                                    <span className="text-destructive"> *</span>
                                </FormLabel>
                                <FormControl>
                                    <Input placeholder={getDefaultLocalDatabaseFileName(type)} {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="connection.localDatabaseDirectory"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel>
                                    {t('Location')}
                                    <span className="text-destructive"> *</span>
                                </FormLabel>
                                <div className="flex gap-2">
                                    <FormControl>
                                        <Input placeholder={DEFAULT_LOCAL_DATABASE_DIRECTORY} {...field} value={field.value ?? ''} />
                                    </FormControl>
                                    {canPickDirectory ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={async () => {
                                                const selectedDirectory = await window.electron?.selectDatabaseDirectory?.();
                                                if (!selectedDirectory) return;
                                                form.setValue('connection.localDatabaseDirectory', selectedDirectory, {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                });
                                            }}
                                        >
                                            {t('Choose')}
                                        </Button>
                                    ) : null}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}
        </div>
    );
}

export function FieldHelp({ text }: { text: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="cursor-pointer inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Show field help"
                >
                    <CircleHelp className="h-4 w-4" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={6} className="max-w-64 text-left leading-relaxed">
                {text}
            </TooltipContent>
        </Tooltip>
    );
}

export function PortField({
    form,
    name,
    label,
    placeholder,
    helpText,
    required = false,
}: {
    form: UseFormReturn<any>;
    name: string;
    label: string;
    placeholder: string;
    helpText: string;
    required?: boolean;
}) {
    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className="space-y-2">
                    <FormLabel className="flex items-center gap-1.5">
                        <span>
                            {label}
                            {required ? <span className="text-destructive"> *</span> : null}
                        </span>
                        <FieldHelp text={helpText} />
                    </FormLabel>
                    <FormControl>
                        <Input
                            inputMode="numeric"
                            placeholder={placeholder}
                            value={field.value?.toString() ?? ''}
                            onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') {
                                    field.onChange('');
                                    return;
                                }
                                const next = Number(raw);
                                if (!Number.isNaN(next)) {
                                    field.onChange(next);
                                }
                            }}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
