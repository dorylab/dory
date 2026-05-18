import type { UseFormReturn } from 'react-hook-form';
import { type RefinementCtx } from 'zod';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { FieldHelp } from './shared';
import { parsePostgresConnectionOptions, parsePostgresHostDraft } from './postgres';

type ParsedNeonConnectionString = {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl: boolean;
    searchParams: Record<string, string>;
};

function parseNeonConnectionString(rawValue: unknown): ParsedNeonConnectionString {
    if (typeof rawValue !== 'string') {
        return { ssl: true, searchParams: {} };
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return { ssl: true, searchParams: {} };
    }

    try {
        const url = new URL(trimmed);
        if (!/^postgres(ql)?:$/i.test(url.protocol)) {
            return { ssl: true, searchParams: {} };
        }

        const hostname = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;
        const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
        const searchParams = Object.fromEntries(url.searchParams.entries());

        return {
            host: hostname || undefined,
            port: url.port ? Number(url.port) : undefined,
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            ssl: sslMode ? sslMode !== 'disable' : true,
            searchParams,
        };
    } catch {
        return { ssl: true, searchParams: {} };
    }
}

function buildNeonQueryString(options: Record<string, unknown>) {
    const searchParams = new URLSearchParams();
    const candidateKeys = ['sslmode', 'options', 'application_name', 'fallback_application_name', 'channel_binding'];

    for (const key of candidateKeys) {
        const value = options[key];
        if (typeof value === 'string' && value.trim()) {
            searchParams.set(key, value);
        }
    }

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
}

export function buildNeonConnectionStringForForm(connection: any, identity?: any) {
    const options = parsePostgresConnectionOptions(connection?.options);
    const storedConnectionString = typeof options.connectionString === 'string' ? options.connectionString.trim() : '';

    if (storedConnectionString) {
        return storedConnectionString;
    }

    const username = identity?.username?.trim?.();
    const host = connection?.host?.trim?.();
    const database = identity?.database?.trim?.() || connection?.database?.trim?.() || 'postgres';
    const ssl = typeof options.ssl === 'boolean' ? options.ssl : typeof options.sslmode === 'string' ? options.sslmode !== 'disable' : true;

    if (!host) {
        return '';
    }

    const encodedUsername = username ? encodeURIComponent(username) : '';
    const userInfo = encodedUsername ? `${encodedUsername}@` : '';
    const port = typeof connection?.port === 'number' ? `:${connection.port}` : '';
    if (!options.sslmode && ssl) {
        options.sslmode = 'require';
    }
    if (!options.channel_binding) {
        options.channel_binding = 'require';
    }

    const search = buildNeonQueryString(options);

    return `postgresql://${userInfo}${host}${port}/${encodeURIComponent(database)}${search}`;
}

export function normalizeNeonIdentityFromConnectionString(
    rawValue: unknown,
    fallbackIdentity?: { id?: string | null; username?: string | null; password?: string | null; database?: string | null } | null,
) {
    const parsed = parseNeonConnectionString(rawValue);

    return {
        id: fallbackIdentity?.id ?? undefined,
        name: 'Neon',
        username: parsed.username ?? fallbackIdentity?.username ?? '',
        role: null,
        password: typeof parsed.password === 'string' && parsed.password.length > 0 ? parsed.password : undefined,
        isDefault: true,
        database: parsed.database ?? fallbackIdentity?.database ?? 'postgres',
    };
}

export function createNeonConnectionDefaults() {
    return {
        type: 'neon',
        name: '',
        description: '',
        host: '',
        port: 5432,
        httpPort: null,
        ssl: true,
        database: 'postgres',
        environment: '',
        tags: '',
    };
}

export function normalizeNeonConnectionForForm(connection: any) {
    const options = parsePostgresConnectionOptions(connection?.options);
    const parsedHost = parsePostgresHostDraft(connection?.host);
    const ssl = typeof options.ssl === 'boolean' ? options.ssl : typeof options.sslmode === 'string' ? options.sslmode !== 'disable' : true;

    return {
        ...createNeonConnectionDefaults(),
        ...connection,
        type: 'neon',
        host: connection?.host ?? parsedHost.host ?? '',
        port: typeof connection?.port === 'number' ? connection.port : (parsedHost.port ?? 5432),
        httpPort: null,
        ssl,
        database: connection?.database ?? parsedHost.database ?? 'postgres',
    };
}

export function normalizeNeonConnectionForSubmit(connection: any) {
    const options = parsePostgresConnectionOptions(connection?.options);
    const { ssl: _ssl, ...restConnection } = connection ?? {};
    const connectionString = connection?.host?.trim?.() ?? '';
    const parsedConnectionString = parseNeonConnectionString(connection?.host);
    const parsedHost = parsePostgresHostDraft(connection?.host);

    options.ssl = parsedConnectionString.ssl;
    options.sslmode = parsedConnectionString.ssl ? 'require' : 'disable';
    Object.assign(options, parsedConnectionString.searchParams);
    options.connectionString = connectionString;
    if (!options.channel_binding) {
        options.channel_binding = 'require';
    }
    delete options.useSSL;
    delete options.protocol;
    delete options.httpPort;

    return {
        ...restConnection,
        type: 'neon',
        host: parsedConnectionString.host ?? parsedHost.host ?? connection?.host?.trim?.() ?? '',
        port: typeof connection?.port === 'number' && Number.isFinite(connection.port) ? connection.port : (parsedConnectionString.port ?? parsedHost.port ?? 5432),
        httpPort: null,
        database: (parsedConnectionString.database ?? connection?.database?.trim?.()) || parsedHost.database || 'postgres',
        options: JSON.stringify(options),
    };
}

export function validateNeonConnection(value: any, ctx: RefinementCtx) {
    const rawConnectionString = value?.host?.trim?.() ?? '';

    if (!rawConnectionString) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'host'],
            message: 'Please provide a Neon connection string',
        });
        return;
    }

    const parsed = parseNeonConnectionString(rawConnectionString);

    if (!parsed.host || !parsed.username) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'host'],
            message: 'Please paste a valid Neon PostgreSQL connection string',
        });
    }
}

export function NeonConnectionFields({ form }: { form: UseFormReturn<any> }) {
    return (
        <div className="space-y-4">
            <FormField
                control={form.control}
                name="connection.host"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>
                                Connection String<span className="text-destructive"> *</span>
                            </span>
                            <FieldHelp text="Paste the Neon PostgreSQL connection string. Username, password, host, port, database, and SSL are parsed automatically." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="postgresql://user:password@ep-xxxx-pooler.us-east-1.aws.neon.tech/dbname?sslmode=require" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
