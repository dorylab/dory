import { type RefinementCtx } from 'zod';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { InputPassword } from '@/components/originui/input-password';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { FieldHelp, LocalDatabaseFileFields } from './shared';
import { buildLocalDatabasePath, DEFAULT_LOCAL_DATABASE_DIRECTORY, getDefaultLocalDatabaseFileName } from './local-database';

type DuckDbMode = 'local' | 'motherduck';

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

function resolveDuckDbMode(connection: any): DuckDbMode {
    const options = parseConnectionOptions(connection?.options);
    return options.mode === 'motherduck' || connection?.duckdbMode === 'motherduck' ? 'motherduck' : 'local';
}

export function createDuckDbConnectionDefaults() {
    return {
        type: 'duckdb',
        name: '',
        description: '',
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: '',
        path: '',
        duckdbMode: 'local',
        localDatabaseSource: 'existing',
        localDatabaseFileName: getDefaultLocalDatabaseFileName('duckdb'),
        localDatabaseDirectory: DEFAULT_LOCAL_DATABASE_DIRECTORY,
        environment: '',
        tags: '',
    };
}

export function normalizeDuckDbConnectionForForm(connection: any) {
    const mode = resolveDuckDbMode(connection);
    return {
        ...createDuckDbConnectionDefaults(),
        ...connection,
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: mode === 'motherduck' ? (connection?.database ?? '') : '',
        path: mode === 'motherduck' ? '' : (connection?.path ?? ''),
        duckdbMode: mode,
        localDatabaseSource: 'existing',
    };
}

export function normalizeDuckDbConnectionForSubmit(connection: any) {
    const mode = resolveDuckDbMode(connection);
    const options = parseConnectionOptions(connection?.options);
    options.mode = mode;
    delete options.ssh;

    const { duckdbMode: _duckdbMode, localDatabaseSource, localDatabaseFileName, localDatabaseDirectory, ...restConnection } = connection ?? {};

    return {
        ...restConnection,
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: mode === 'motherduck' ? connection?.database?.trim?.() || null : null,
        path:
            mode === 'motherduck'
                ? null
                : localDatabaseSource === 'new'
                  ? buildLocalDatabasePath('duckdb', localDatabaseDirectory ?? '', localDatabaseFileName ?? '')
                  : connection?.path?.trim?.() || '',
        options: JSON.stringify(options),
    };
}

export function validateDuckDbConnection(value: any, ctx: RefinementCtx) {
    void value;
    void ctx;
}

export function DuckDbConnectionFields({ form, isEditMode }: { form: UseFormReturn<any>; isEditMode?: boolean }) {
    const mode = useWatch({ control: form.control, name: 'connection.duckdbMode' }) as DuckDbMode | undefined;
    const resolvedMode = mode === 'motherduck' ? 'motherduck' : 'local';

    return (
        <div className="space-y-4">
            <FormField
                control={form.control}
                name="connection.duckdbMode"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>Mode</span>
                            <FieldHelp text="Use a local DuckDB file or connect to MotherDuck with a token." />
                        </FormLabel>
                        <Select
                            value={field.value ?? 'local'}
                            onValueChange={value => {
                                field.onChange(value);
                                if (value === 'motherduck') {
                                    form.setValue('connection.path', '', { shouldDirty: true, shouldValidate: false });
                                    form.setValue('connection.database', '', { shouldDirty: true, shouldValidate: false });
                                } else {
                                    form.setValue('connection.database', '', { shouldDirty: true, shouldValidate: false });
                                }
                            }}
                        >
                            <FormControl className="w-full">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="local">Local file</SelectItem>
                                <SelectItem value="motherduck">MotherDuck</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {resolvedMode === 'local' ? (
                <LocalDatabaseFileFields form={form} type="duckdb" isEditMode={isEditMode} />
            ) : (
                <>
                    <FormField
                        control={form.control}
                        name="connection.database"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel className="flex items-center gap-1.5">
                                    <span>MotherDuck Database</span>
                                    <FieldHelp text="Optional database name. The driver connects with the md: prefix automatically." />
                                </FormLabel>
                                <FormControl>
                                    <Input placeholder="my_database" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="identity.password"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel className="flex items-center gap-1.5">
                                    <span>MotherDuck Token</span>
                                    <FieldHelp text="Stored as the connection secret. It is not saved in connection options." />
                                </FormLabel>
                                <FormControl>
                                    <InputPassword type="password" autoComplete="new-password" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </>
            )}
        </div>
    );
}
