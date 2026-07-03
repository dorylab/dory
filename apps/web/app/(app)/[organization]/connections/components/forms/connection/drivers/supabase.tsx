import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { type RefinementCtx } from 'zod';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { FieldHelp } from './shared';
import { parsePostgresConnectionOptions, parsePostgresHostDraft } from './postgres';

export type ParsedSupabaseConnectionString = {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl: boolean;
    searchParams: Record<string, string>;
    isTransactionPooler: boolean;
};

type SupabaseConnectionLike = {
    type?: string | null;
    engine?: string | null;
    name?: string | null;
    description?: string | null;
    host?: string | null;
    port?: number | string | null;
    httpPort?: number | null;
    database?: string | null;
    path?: string | null;
    environment?: string | null;
    tags?: string | null;
    options?: unknown;
    ssl?: unknown;
};

type SupabaseIdentityLike = {
    username?: string | null;
    database?: string | null;
};

function trimmedString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseSupabaseConnectionString(rawValue: unknown): ParsedSupabaseConnectionString {
    if (typeof rawValue !== 'string') {
        return { ssl: true, searchParams: {}, isTransactionPooler: false };
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return { ssl: true, searchParams: {}, isTransactionPooler: false };
    }

    try {
        const url = new URL(trimmed);
        if (!/^postgres(ql)?:$/i.test(url.protocol)) {
            return { ssl: true, searchParams: {}, isTransactionPooler: false };
        }

        const hostname = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;
        const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
        const searchParams = Object.fromEntries(url.searchParams.entries());
        const port = url.port ? Number(url.port) : undefined;

        return {
            host: hostname || undefined,
            port,
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            ssl: sslMode ? sslMode !== 'disable' : true,
            searchParams,
            isTransactionPooler: port === 6543,
        };
    } catch {
        return { ssl: true, searchParams: {}, isTransactionPooler: false };
    }
}

function buildSupabaseQueryString(options: Record<string, unknown>) {
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

export function buildSupabaseConnectionStringForForm(connection?: SupabaseConnectionLike | null, identity?: SupabaseIdentityLike | null) {
    const options = parsePostgresConnectionOptions(connection?.options);
    const storedConnectionString = typeof options.connectionString === 'string' ? options.connectionString.trim() : '';

    if (storedConnectionString) {
        return storedConnectionString;
    }

    const username = trimmedString(identity?.username);
    const host = trimmedString(connection?.host);
    const database = trimmedString(identity?.database) || trimmedString(connection?.database) || 'postgres';
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

    const search = buildSupabaseQueryString(options);

    return `postgresql://${userInfo}${host}${port}/${encodeURIComponent(database)}${search}`;
}

export function normalizeSupabaseIdentityFromConnectionString(
    rawValue: unknown,
    fallbackIdentity?: { id?: string | null; username?: string | null; password?: string | null; database?: string | null } | null,
) {
    const parsed = parseSupabaseConnectionString(rawValue);

    return {
        id: fallbackIdentity?.id ?? undefined,
        name: 'Supabase',
        username: parsed.username ?? fallbackIdentity?.username ?? '',
        role: null,
        password: typeof parsed.password === 'string' && parsed.password.length > 0 ? parsed.password : undefined,
        isDefault: true,
        database: parsed.database ?? fallbackIdentity?.database ?? 'postgres',
    };
}

export function createSupabaseConnectionDefaults() {
    return {
        type: 'supabase',
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

export function normalizeSupabaseConnectionForForm(connection?: SupabaseConnectionLike | null) {
    const options = parsePostgresConnectionOptions(connection?.options);
    const parsedHost = parsePostgresHostDraft(connection?.host);
    const ssl = typeof options.ssl === 'boolean' ? options.ssl : typeof options.sslmode === 'string' ? options.sslmode !== 'disable' : true;

    return {
        ...createSupabaseConnectionDefaults(),
        ...connection,
        type: 'supabase',
        host: connection?.host ?? parsedHost.host ?? '',
        port: typeof connection?.port === 'number' ? connection.port : (parsedHost.port ?? 5432),
        httpPort: null,
        ssl,
        database: connection?.database ?? parsedHost.database ?? 'postgres',
    };
}

export function normalizeSupabaseConnectionForSubmit(connection?: SupabaseConnectionLike | null) {
    const options = parsePostgresConnectionOptions(connection?.options);
    const restConnection = { ...(connection ?? {}) };
    delete restConnection.ssl;
    const connectionString = trimmedString(connection?.host) ?? '';
    const parsedConnectionString = parseSupabaseConnectionString(connection?.host);
    const parsedHost = parsePostgresHostDraft(connection?.host);

    options.ssl = parsedConnectionString.ssl;
    options.sslmode = parsedConnectionString.ssl ? 'require' : 'disable';
    Object.assign(options, parsedConnectionString.searchParams);
    options.connectionString = connectionString;
    delete options.useSSL;
    delete options.protocol;
    delete options.httpPort;

    return {
        ...restConnection,
        type: 'supabase',
        engine: 'postgres',
        host: parsedConnectionString.host ?? parsedHost.host ?? trimmedString(connection?.host) ?? '',
        port: typeof connection?.port === 'number' && Number.isFinite(connection.port) ? Math.trunc(connection.port) : (parsedConnectionString.port ?? parsedHost.port ?? 5432),
        httpPort: null,
        database: (parsedConnectionString.database ?? trimmedString(connection?.database)) || parsedHost.database || 'postgres',
        options: JSON.stringify(options),
    };
}

export function validateSupabaseConnection(value: unknown, ctx: RefinementCtx) {
    const rawConnectionString = trimmedString((value as SupabaseConnectionLike | null | undefined)?.host) ?? '';

    if (!rawConnectionString) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'host'],
            message: 'Please provide a Supabase connection string',
        });
        return;
    }

    const parsed = parseSupabaseConnectionString(rawConnectionString);

    if (!parsed.host || !parsed.username) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'host'],
            message: 'Please paste a valid Supabase PostgreSQL connection string',
        });
    }
}

export function SupabaseConnectionFields({ form }: { form: UseFormReturn<FieldValues> }) {
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
                            <FieldHelp text="Paste a Supabase PostgreSQL direct or session pooler connection string. Transaction pooler URLs can be tested, but direct or session pooler connections are recommended for Dory's interactive SQL workspace." />
                        </FormLabel>
                        <FormControl>
                            <Input
                                placeholder="postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
                                {...field}
                                value={field.value ?? ''}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
