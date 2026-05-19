import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { FieldHelp, PortField } from './shared';

function parseOracleHostDraft(rawHost: unknown): { host?: string; port?: number; database?: string } {
    if (typeof rawHost !== 'string') return {};
    const trimmed = rawHost.trim();
    if (!trimmed) return {};

    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);

    try {
        const url = new URL(hasProtocol ? trimmed : `oracle://${trimmed}`);
        const hostname = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;

        return {
            host: hostname || trimmed,
            port: url.port ? Number(url.port) : undefined,
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

export function createOracleConnectionDefaults() {
    return {
        type: 'oracle',
        name: '',
        description: '',
        host: '',
        port: 1521,
        httpPort: null,
        database: '',
        connectString: '',
        environment: '',
        tags: '',
    };
}

export function normalizeOracleConnectionForForm(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const parsedHost = parseOracleHostDraft(connection?.host);

    return {
        ...createOracleConnectionDefaults(),
        ...connection,
        host: parsedHost.host ?? connection?.host ?? '',
        port: typeof connection?.port === 'number' ? connection.port : (parsedHost.port ?? 1521),
        httpPort: null,
        database: connection?.database ?? parsedHost.database ?? '',
        connectString: typeof options.connectString === 'string' ? options.connectString : '',
    };
}

export function normalizeOracleConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    const { connectString, ...restConnection } = connection ?? {};
    const parsedHost = parseOracleHostDraft(connection?.host);
    const normalizedConnectString = typeof connectString === 'string' ? connectString.trim() : '';

    if (normalizedConnectString) {
        options.connectString = normalizedConnectString;
    } else {
        delete options.connectString;
    }

    return {
        ...restConnection,
        host: parsedHost.host ?? connection?.host?.trim?.() ?? '',
        port: typeof connection?.port === 'number' && Number.isFinite(connection.port) ? connection.port : (parsedHost.port ?? 1521),
        httpPort: null,
        database: connection?.database?.trim?.() || parsedHost.database || null,
        options: JSON.stringify(options),
    };
}

export function validateOracleConnection(value: any, ctx: RefinementCtx) {
    const parsedHost = parseOracleHostDraft(value?.host);
    const serviceName = value?.database?.trim?.() || parsedHost.database;
    const connectString = value?.connectString?.trim?.();

    if (!serviceName && !connectString) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'database'],
            message: 'Please provide an Oracle service name',
        });
    }
}

export function OracleConnectionFields({ form }: { form: UseFormReturn<any> }) {
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
                                <FieldHelp text="Use your Oracle hostname, IP address, or Easy Connect host form." />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder="db.example.com or oracle://db.example.com:1521/ORCLPDB1" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <PortField
                    form={form}
                    name="connection.port"
                    label="Port"
                    placeholder="1521"
                    helpText="Oracle usually uses 1521 unless your listener is configured differently."
                    required
                />
            </div>

            <FormField
                control={form.control}
                name="connection.database"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>
                                Service Name<span className="text-destructive"> *</span>
                            </span>
                            <FieldHelp text="Oracle service name, for example ORCLPDB1 or a pluggable database service." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="ORCLPDB1" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="connection.connectString"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>Connect String</span>
                            <FieldHelp text="Optional Easy Connect string override for advanced Oracle listener setups." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="db.example.com:1521/ORCLPDB1" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
