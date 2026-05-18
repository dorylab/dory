import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { FieldHelp, PortField } from './shared';

function parseSqlServerHostDraft(rawHost: unknown): { host?: string; port?: number; database?: string; encrypt?: boolean } {
    if (typeof rawHost !== 'string') return {};
    const trimmed = rawHost.trim();
    if (!trimmed) return {};

    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);

    try {
        const url = new URL(hasProtocol ? trimmed : `sqlserver://${trimmed}`);
        const hostname = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;
        const encryptParam = url.searchParams.get('encrypt');

        return {
            host: hostname || trimmed,
            port: url.port ? Number(url.port) : undefined,
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            encrypt: encryptParam === null ? undefined : encryptParam === 'true' || encryptParam === '1',
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

export function createSqlServerConnectionDefaults() {
    return {
        type: 'sqlserver',
        name: '',
        description: '',
        host: '',
        port: 1433,
        httpPort: null,
        encrypt: true,
        trustServerCertificate: false,
        database: '',
        environment: '',
        tags: '',
    };
}

export function normalizeSqlServerConnectionForForm(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const parsedHost = parseSqlServerHostDraft(connection?.host);

    return {
        ...createSqlServerConnectionDefaults(),
        ...connection,
        host: parsedHost.host ?? connection?.host ?? '',
        port: typeof connection?.port === 'number' ? connection.port : (parsedHost.port ?? 1433),
        httpPort: null,
        encrypt: parsedHost.encrypt ?? (typeof options.encrypt === 'boolean' ? options.encrypt : true),
        trustServerCertificate: typeof options.trustServerCertificate === 'boolean' ? options.trustServerCertificate : false,
        database: connection?.database ?? parsedHost.database ?? '',
    };
}

export function normalizeSqlServerConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const { encrypt: _encrypt, trustServerCertificate: _trustServerCertificate, ...restConnection } = connection ?? {};
    const parsedHost = parseSqlServerHostDraft(connection?.host);

    options.encrypt = parsedHost.encrypt ?? Boolean(connection?.encrypt);
    options.trustServerCertificate = Boolean(connection?.trustServerCertificate);

    return {
        ...restConnection,
        host: parsedHost.host ?? connection?.host?.trim?.() ?? '',
        port: typeof connection?.port === 'number' && Number.isFinite(connection.port) ? connection.port : (parsedHost.port ?? 1433),
        httpPort: null,
        database: connection?.database?.trim?.() || parsedHost.database || null,
        options: JSON.stringify(options),
    };
}

export function validateSqlServerConnection(_value: any, _ctx: RefinementCtx) {}

export function SqlServerConnectionFields({ form }: { form: UseFormReturn<any> }) {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-start">
                <FormField
                    control={form.control}
                    name="connection.host"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel className="flex items-center gap-1.5">
                                <span>
                                    Host<span className="text-destructive"> *</span>
                                </span>
                                <FieldHelp text="Use your SQL Server hostname or IP address." />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder="db.example.com or sqlserver://db.example.com/app_db" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <PortField
                    form={form}
                    name="connection.port"
                    label="Port"
                    placeholder="1433"
                    helpText="SQL Server usually uses 1433 unless your server is configured differently."
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
                            <FieldHelp text="Optional default SQL Server database to connect to." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="app_db" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
