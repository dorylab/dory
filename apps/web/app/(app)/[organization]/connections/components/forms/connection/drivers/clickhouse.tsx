import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { FieldHelp, PortField } from './shared';

function parseClickhouseHostDraft(rawHost: unknown): { host?: string; httpPort?: number; ssl?: boolean; database?: string } {
    if (typeof rawHost !== 'string') return {};
    const trimmed = rawHost.trim();
    if (!trimmed) return {};

    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);

    try {
        const url = new URL(hasProtocol ? trimmed : `http://${trimmed}`);
        const hostname = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;

        return {
            host: hostname || trimmed,
            httpPort: url.port ? Number(url.port) : undefined,
            ssl: hasProtocol ? url.protocol === 'https:' : undefined,
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
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

export function createClickhouseConnectionDefaults() {
    return {
        type: 'clickhouse',
        name: '',
        description: '',
        host: '',
        port: 9000,
        httpPort: 8123,
        ssl: false,
        database: '',
        environment: '',
        tags: '',
    };
}

export function normalizeClickhouseConnectionForForm(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const parsedHost = parseClickhouseHostDraft(connection?.host);
    const sslFromOptions =
        typeof options.ssl === 'boolean'
            ? options.ssl
            : typeof options.useSSL === 'boolean'
              ? options.useSSL
              : typeof options.protocol === 'string'
                ? options.protocol.toLowerCase().startsWith('https')
                : undefined;
    const ssl = parsedHost.ssl ?? sslFromOptions ?? false;

    return {
        ...createClickhouseConnectionDefaults(),
        ...connection,
        host: parsedHost.host ?? connection?.host ?? '',
        port: typeof connection?.port === 'number' ? connection.port : 9000,
        httpPort: connection?.httpPort ?? parsedHost.httpPort ?? (ssl ? 8443 : 8123),
        ssl,
        database: connection?.database ?? parsedHost.database ?? '',
    };
}

export function normalizeClickhouseConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const { ssl: _ssl, ...restConnection } = connection ?? {};
    const parsedHost = parseClickhouseHostDraft(connection?.host);
    const ssl = parsedHost.ssl ?? Boolean(connection?.ssl);
    const httpPort =
        typeof connection?.httpPort === 'number' && Number.isFinite(connection.httpPort)
            ? connection.httpPort
            : parsedHost.httpPort ?? (ssl ? 8443 : 8123);

    options.ssl = ssl;
    options.useSSL = ssl;
    options.protocol = ssl ? 'https' : 'http';
    options.httpPort = httpPort;

    return {
        ...restConnection,
        host: parsedHost.host ?? connection?.host?.trim?.() ?? '',
        port: typeof connection?.port === 'number' ? connection.port : 9000,
        httpPort,
        database: connection?.database?.trim?.() || parsedHost.database || null,
        options: JSON.stringify(options),
    };
}

export function validateClickhouseConnection(value: any, ctx: RefinementCtx) {
    if (!value.httpPort) {
        ctx.addIssue({
            code: 'custom',
            path: ['httpPort'],
            message: 'Please provide an HTTP port',
        });
    }
}

export function ClickhouseConnectionFields({ form }: { form: UseFormReturn<any> }) {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-start">
                <FormField
                    control={form.control}
                    name="connection.host"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel className="flex items-center gap-1.5">
                                <span>Host<span className="text-destructive"> *</span></span>
                                <FieldHelp text="Use your ClickHouse server hostname or IP address." />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder="example.us-east-1.aws.clickhouse.cloud" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <PortField
                    form={form}
                    name="connection.httpPort"
                    label="HTTP Port"
                    placeholder="8123"
                    helpText="ClickHouse Cloud usually uses 8443 for HTTPS."
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
                            <FieldHelp text="Optional default database used when no database is explicitly selected." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="default" {...field} value={field.value ?? ''} />
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
                                <FieldHelp text="Turn this on for ClickHouse Cloud or any HTTPS endpoint." />
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
