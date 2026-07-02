import { type RefinementCtx } from 'zod';
import { type FieldValues, UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { FieldHelp } from './shared';

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

function parseAccountDraft(rawHost: unknown): string {
    if (typeof rawHost !== 'string') return '';
    const trimmed = rawHost.trim();
    if (!trimmed) return '';

    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
        return url.hostname.replace(/\.snowflakecomputing\.com$/i, '');
    } catch {
        return trimmed.replace(/\.snowflakecomputing\.com$/i, '');
    }
}

function textOption(options: Record<string, unknown>, key: string): string {
    const value = options[key];
    return typeof value === 'string' ? value : '';
}

type SnowflakeConnectionDraft = Record<string, unknown> & {
    host?: string | null;
    options?: string | Record<string, unknown> | null;
    database?: string | null;
    warehouse?: string | null;
    schema?: string | null;
    authMethod?: string | null;
};

export function createSnowflakeConnectionDefaults() {
    return {
        type: 'snowflake',
        name: '',
        description: '',
        host: '',
        port: null,
        httpPort: null,
        database: '',
        warehouse: '',
        schema: '',
        authMethod: 'password',
        environment: '',
        tags: '',
    };
}

export function normalizeSnowflakeConnectionForForm(connection: SnowflakeConnectionDraft | null | undefined) {
    const options = parseConnectionOptions(connection?.options);
    const account = textOption(options, 'account') || parseAccountDraft(connection?.host);

    return {
        ...createSnowflakeConnectionDefaults(),
        ...connection,
        host: account,
        port: null,
        httpPort: null,
        database: connection?.database ?? '',
        warehouse: textOption(options, 'warehouse'),
        schema: textOption(options, 'schema'),
        authMethod: textOption(options, 'authMethod') === 'key_pair' ? 'key_pair' : 'password',
    };
}

export function normalizeSnowflakeConnectionForSubmit(connection: SnowflakeConnectionDraft | null | undefined) {
    const options = parseConnectionOptions(connection?.options);
    const { warehouse, schema, authMethod, ...restConnection } = connection ?? {};
    const account = parseAccountDraft(connection?.host);

    options.account = account;
    options.warehouse = typeof warehouse === 'string' && warehouse.trim() ? warehouse.trim() : undefined;
    options.schema = typeof schema === 'string' && schema.trim() ? schema.trim() : undefined;
    options.authMethod = authMethod === 'key_pair' ? 'key_pair' : 'password';

    return {
        ...restConnection,
        host: account,
        port: null,
        httpPort: null,
        database: typeof connection?.database === 'string' && connection.database.trim() ? connection.database.trim() : null,
        options: JSON.stringify(options),
    };
}

export function validateSnowflakeConnection(value: SnowflakeConnectionDraft | null | undefined, ctx: RefinementCtx) {
    if (!parseAccountDraft(value?.host)) {
        ctx.addIssue({
            code: 'custom',
            path: ['host'],
            message: 'Please provide a Snowflake account identifier',
        });
    }
}

export function SnowflakeConnectionFields({ form }: { form: UseFormReturn<FieldValues> }) {
    return (
        <div className="space-y-4">
            <FormField
                control={form.control}
                name="connection.host"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>
                                Account Identifier<span className="text-destructive"> *</span>
                            </span>
                            <FieldHelp text="Use the Snowflake account identifier, for example xy12345.us-east-1 or org-account." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="xy12345.us-east-1" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <div className="grid gap-4 md:grid-cols-3">
                <FormField
                    control={form.control}
                    name="connection.warehouse"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>Warehouse</FormLabel>
                            <FormControl>
                                <Input placeholder="COMPUTE_WH" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="connection.database"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>Default Database</FormLabel>
                            <FormControl>
                                <Input placeholder="ANALYTICS" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="connection.schema"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>Default Schema</FormLabel>
                            <FormControl>
                                <Input placeholder="PUBLIC" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <FormField
                control={form.control}
                name="connection.authMethod"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel>Authentication</FormLabel>
                        <Select value={field.value ?? 'password'} onValueChange={field.onChange}>
                            <FormControl>
                                <SelectTrigger className="w-full max-w-80">
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="password">Password</SelectItem>
                                <SelectItem value="key_pair">Key pair</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
