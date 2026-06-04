'use client';

import { type FieldValues, type UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { CertificateField } from '@/app/(app)/[organization]/connections/components/forms/tls/certificate-field';

const TLS_MODE_OPTIONS = {
    default: [
        { value: 'disable', label: 'Disable' },
        { value: 'prefer', label: 'Prefer' },
        { value: 'require', label: 'Require' },
        { value: 'verify-ca', label: 'Verify CA' },
        { value: 'verify-identity', label: 'Verify identity' },
    ],
    sqlserver: [
        { value: 'disable', label: 'Disable' },
        { value: 'require', label: 'Require' },
        { value: 'verify-identity', label: 'Verify identity' },
    ],
    clickhouse: [
        { value: 'disable', label: 'Disable' },
        { value: 'require', label: 'HTTPS' },
        { value: 'verify-ca', label: 'HTTPS + CA certificate' },
        { value: 'verify-identity', label: 'Mutual TLS' },
    ],
};

export function TLSConnectionForm({ form, connectionType }: { form: UseFormReturn<FieldValues>; connectionType?: string }) {
    const mode = form.watch('tls.mode') ?? 'disable';
    const modeOptions = connectionType === 'sqlserver' ? TLS_MODE_OPTIONS.sqlserver : connectionType === 'clickhouse' ? TLS_MODE_OPTIONS.clickhouse : TLS_MODE_OPTIONS.default;
    const enabled = mode !== 'disable';
    const isClickhouse = connectionType === 'clickhouse';
    const showCaCertificate = enabled && (!isClickhouse || mode === 'verify-ca' || mode === 'verify-identity');
    const showClientCertificate = enabled && (!isClickhouse || mode === 'verify-identity');
    const showAdvancedFields = enabled && !isClickhouse;
    const showCertificateFields = showCaCertificate || showClientCertificate;

    return (
        <div className="space-y-5">
            <FormField
                control={form.control}
                name="tls.mode"
                render={({ field }) => (
                    <FormItem className="grid gap-2 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
                        <FormLabel className="text-sm font-medium">Mode</FormLabel>
                        <Select value={field.value ?? 'disable'} onValueChange={field.onChange}>
                            <FormControl>
                                <SelectTrigger className="w-full md:max-w-80" aria-label="TLS mode">
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {modeOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {enabled ? (
                <>
                    {showCertificateFields ? (
                        <div className="space-y-4 border-t pt-5">
                            {showCaCertificate ? (
                                <CertificateField
                                    form={form}
                                    label="CA certificate"
                                    sourceName="tls.caCertificateSource"
                                    pathName="tls.caCertificatePath"
                                    contentName="tls.caCertificateContent"
                                    hasContentName="tls.hasCaCertificateContent"
                                    placeholder="Paste PEM-formatted CA certificate"
                                />
                            ) : null}
                            {showClientCertificate ? (
                                <>
                                    <CertificateField
                                        form={form}
                                        label="Client certificate"
                                        sourceName="tls.clientCertificateSource"
                                        pathName="tls.clientCertificatePath"
                                        contentName="tls.clientCertificateContent"
                                        hasContentName="tls.hasClientCertificateContent"
                                        placeholder="Paste PEM-formatted client certificate"
                                    />
                                    <CertificateField
                                        form={form}
                                        label="Client private key"
                                        sourceName="tls.clientPrivateKeySource"
                                        pathName="tls.clientPrivateKeyPath"
                                        contentName="tls.clientPrivateKeyContent"
                                        hasContentName="tls.hasClientPrivateKeyContent"
                                        placeholder="Paste PEM-formatted client private key"
                                    />
                                </>
                            ) : null}
                        </div>
                    ) : null}

                    {showAdvancedFields ? (
                        <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="tls.clientPrivateKeyPassphrase"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col gap-2">
                                        <FormLabel>Private key passphrase</FormLabel>
                                        <FormControl>
                                            <Input type="password" autoComplete="new-password" placeholder="Optional" {...field} value={field.value ?? ''} />
                                        </FormControl>
                                        {form.watch('tls.hasClientPrivateKeyPassphrase') && !field.value ? (
                                            <span className="text-xs text-muted-foreground">Saved passphrase will be reused.</span>
                                        ) : null}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="tls.serverName"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col gap-2">
                                        <FormLabel>Server name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="db.example.com" {...field} value={field.value ?? ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    ) : null}

                    {showAdvancedFields ? (
                        <div className="grid gap-4 md:grid-cols-3">
                            <FormField
                                control={form.control}
                                name="tls.ciphers"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col gap-2">
                                        <FormLabel>Cipher suites</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Optional" {...field} value={field.value ?? ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="tls.minVersion"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col gap-2">
                                        <FormLabel>Min TLS</FormLabel>
                                        <FormControl>
                                            <Input placeholder="TLSv1.2" {...field} value={field.value ?? ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="tls.maxVersion"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col gap-2">
                                        <FormLabel>Max TLS</FormLabel>
                                        <FormControl>
                                            <Input placeholder="TLSv1.3" {...field} value={field.value ?? ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
