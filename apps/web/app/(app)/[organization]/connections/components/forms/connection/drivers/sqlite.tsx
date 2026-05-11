import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Button } from '@/registry/new-york-v4/ui/button';
import { FieldHelp } from './shared';
import { useTranslations } from 'next-intl';
import { isDesktopRuntime } from '@dory/shared/runtime';

function isAbsolutePath(value: string) {
    return /^(\/|[a-zA-Z]:[\\/])/.test(value);
}

function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return {};
        }
    }
    return {};
}

export function createSqliteConnectionDefaults() {
    return {
        type: 'sqlite',
        name: '',
        description: '',
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: 'main',
        path: '',
        environment: '',
        tags: '',
    };
}

export function normalizeSqliteConnectionForForm(connection: any) {
    return {
        ...createSqliteConnectionDefaults(),
        ...connection,
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: connection?.database ?? 'main',
        path: connection?.path ?? '',
    };
}

export function normalizeSqliteConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    delete options.ssh;

    return {
        ...connection,
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: connection?.database?.trim?.() || 'main',
        path: connection?.path?.trim?.() || '',
        options: JSON.stringify(options),
    };
}

export function validateSqliteConnection(value: any, ctx: RefinementCtx) {
    const normalizedPath = value?.path?.trim?.() ?? '';
    void ctx;
    void normalizedPath;
    void isAbsolutePath;
}

export function SqliteConnectionFields({ form }: { form: UseFormReturn<any> }) {
    const t = useTranslations('Connections.ConnectionContent');
    const canPickFile = isDesktopRuntime() && typeof window !== 'undefined' && typeof window.electron?.selectSqliteFile === 'function';

    return (
        <div className="space-y-4">
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
                            <FieldHelp text="Use an absolute path to an existing .sqlite or .db file that the server process can access." />
                        </FormLabel>
                        <FormControl>
                            <div className="flex gap-2">
                                <Input placeholder={t('Select File Placeholder')} {...field} value={field.value ?? ''} />
                                {canPickFile ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={async () => {
                                            const selectedPath = await window.electron?.selectSqliteFile?.();
                                            if (!selectedPath) {
                                                return;
                                            }
                                            form.setValue('connection.path', selectedPath, {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            });
                                        }}
                                    >
                                        {t('Choose')}
                                    </Button>
                                ) : null}
                            </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
