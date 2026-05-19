import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { FieldHelp, PortField } from './shared';

function parseMariaDbHostDraft(rawHost: unknown): { host?: string; port?: number; database?: string; ssl?: boolean } {
    if (typeof rawHost !== 'string') return {};
    const trimmed = rawHost.trim();
    if (!trimmed) return {};

    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);

    try {
        const url = new URL(hasProtocol ? trimmed : `mariadb://${trimmed}`);
        const hostname = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;
        const protocol = url.protocol.toLowerCase();

        return {
            host: hostname || trimmed,
            port: url.port ? Number(url.port) : undefined,
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            ssl: protocol === 'mariadbs:',
        };
    } catch {
        return { host: trimmed };
    }
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

export function createMariaDbConnectionDefaults() {
    return {
        type: 'mariadb',
        name: '',
        description: '',
        host: '',
        port: 3306,
        httpPort: null,
        ssl: false,
        database: '',
        environment: '',
        tags: '',
    };
}

export function normalizeMariaDbConnectionForForm(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const parsedHost = parseMariaDbHostDraft(connection?.host);
    const ssl = parsedHost.ssl ?? (typeof options.ssl === 'boolean' ? options.ssl : Boolean(options.ssl && typeof options.ssl === 'object'));

    return {
        ...createMariaDbConnectionDefaults(),
        ...connection,
        host: parsedHost.host ?? connection?.host ?? '',
        port: typeof connection?.port === 'number' ? connection.port : (parsedHost.port ?? 3306),
        httpPort: null,
        ssl,
        database: connection?.database ?? parsedHost.database ?? '',
    };
}

export function normalizeMariaDbConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const { ssl: _ssl, ...restConnection } = connection ?? {};
    const parsedHost = parseMariaDbHostDraft(connection?.host);
    const ssl = parsedHost.ssl ?? Boolean(connection?.ssl);

    options.ssl = ssl;

    return {
        ...restConnection,
        host: parsedHost.host ?? connection?.host?.trim?.() ?? '',
        port: typeof connection?.port === 'number' && Number.isFinite(connection.port) ? connection.port : (parsedHost.port ?? 3306),
        httpPort: null,
        database: connection?.database?.trim?.() || parsedHost.database || null,
        options: JSON.stringify(options),
    };
}

export function validateMariaDbConnection(_value: any, _ctx: RefinementCtx) {}

export function MariaDbConnectionFields({ form }: { form: UseFormReturn<any> }) {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem] items-start">
                <FormField
                    control={form.control}
                    name="connection.host"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel className="flex items-center gap-1.5">
                                <span>
                                    Host<span className="text-destructive"> *</span>
                                </span>
                                <FieldHelp text="Use your MariaDB server hostname or IP address." />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder="db.example.com or mariadb://db.example.com/app_db" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <PortField
                    form={form}
                    name="connection.port"
                    label="Port"
                    placeholder="3306"
                    helpText="MariaDB usually uses 3306 unless your server is configured differently."
                    required
                />
            </div>

            <FormField
                control={form.control}
                name="connection.database"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>Default Database</span>
                            <FieldHelp text="Optional default MariaDB database to connect to." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="app_db" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="connection.ssl"
                render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <FormLabel className="text-sm font-medium">SSL</FormLabel>
                                <FieldHelp text="Turn this on when the MariaDB server requires TLS." />
                            </div>
                        </div>
                        <FormControl>
                            <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                        </FormControl>
                    </FormItem>
                )}
            />
        </div>
    );
}
