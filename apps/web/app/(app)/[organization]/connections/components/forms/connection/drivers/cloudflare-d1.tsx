import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { InputPassword } from '@/components/originui/input-password';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
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

export function createCloudflareD1ConnectionDefaults() {
    return {
        type: 'cloudflare-d1',
        name: '',
        description: '',
        host: 'api.cloudflare.com',
        port: null,
        httpPort: null,
        ssl: true,
        database: '',
        accountId: '',
        path: null,
        environment: '',
        tags: '',
    };
}

export function normalizeCloudflareD1ConnectionForForm(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    return {
        ...createCloudflareD1ConnectionDefaults(),
        ...connection,
        host: connection?.host ?? 'api.cloudflare.com',
        port: null,
        httpPort: null,
        ssl: true,
        database: connection?.database ?? '',
        accountId: typeof options.accountId === 'string' ? options.accountId : '',
        path: null,
    };
}

export function normalizeCloudflareD1ConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    options.accountId = connection?.accountId?.trim?.() || '';
    delete options.ssh;

    const { accountId: _accountId, ...restConnection } = connection ?? {};

    return {
        ...restConnection,
        host: 'api.cloudflare.com',
        port: null,
        httpPort: null,
        ssl: true,
        database: connection?.database?.trim?.() || '',
        path: null,
        options: JSON.stringify(options),
    };
}

export function validateCloudflareD1Connection(value: any, ctx: RefinementCtx) {
    if (!value?.accountId?.trim?.()) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'accountId'],
            message: 'Please provide a Cloudflare account ID',
        });
    }

    if (!value?.database?.trim?.()) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'database'],
            message: 'Please provide a D1 database ID',
        });
    }
}

export function CloudflareD1ConnectionFields({ form }: { form: UseFormReturn<any> }) {
    return (
        <div className="space-y-4">
            <FormField
                control={form.control}
                name="connection.accountId"
                render={({ field }) => (
                    <FormItem className="space-y-2">
                        <FormLabel className="flex items-center gap-1.5">
                            <span>
                                Account ID<span className="text-destructive"> *</span>
                            </span>
                            <FieldHelp text="Cloudflare account identifier used in the D1 REST API path." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="023e105f4ecef8ad9ca31a8372d0c353" {...field} value={field.value ?? ''} />
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
                        <FormLabel className="flex items-center gap-1.5">
                            <span>
                                Database ID<span className="text-destructive"> *</span>
                            </span>
                            <FieldHelp text="D1 database UUID from the Cloudflare dashboard." />
                        </FormLabel>
                        <FormControl>
                            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...field} value={field.value ?? ''} />
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
                            <span>
                                API Token<span className="text-destructive"> *</span>
                            </span>
                            <FieldHelp text="Stored as the connection secret. Leave blank when editing to keep the saved token." />
                        </FormLabel>
                        <FormControl>
                            <InputPassword type="password" autoComplete="new-password" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
