'use client';

import { type ChangeEvent, useRef } from 'react';
import { FileUp } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/registry/new-york-v4/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { RadioGroup, RadioGroupItem } from '@/registry/new-york-v4/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

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
};

type CertificateFieldProps = {
    form: UseFormReturn<any>;
    label: string;
    sourceName: string;
    pathName: string;
    contentName: string;
    hasContentName: string;
    placeholder: string;
};

function CertificateField({ form, label, sourceName, pathName, contentName, hasContentName, placeholder }: CertificateFieldProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const source = form.watch(sourceName) ?? 'path';
    const hasContent = Boolean(form.watch(hasContentName));
    const contentValue = form.watch(contentName);

    const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                form.setValue(contentName, reader.result, { shouldDirty: true, shouldValidate: true });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    return (
        <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-3">
                <FormLabel className="text-sm font-medium">{label}</FormLabel>
                <FormField
                    control={form.control}
                    name={sourceName}
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <RadioGroup className="flex items-center gap-3" value={field.value ?? 'path'} onValueChange={field.onChange}>
                                    <div className="flex items-center gap-1.5">
                                        <RadioGroupItem id={`${sourceName}-path`} value="path" />
                                        <Label htmlFor={`${sourceName}-path`} className="cursor-pointer text-xs text-muted-foreground">
                                            Path
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <RadioGroupItem id={`${sourceName}-content`} value="content" />
                                        <Label htmlFor={`${sourceName}-content`} className="cursor-pointer text-xs text-muted-foreground">
                                            Content
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            {source === 'content' ? (
                <FormField
                    control={form.control}
                    name={contentName}
                    render={({ field }) => (
                        <FormItem className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                                {hasContent && !contentValue ? <span className="text-xs text-muted-foreground">Saved content will be reused.</span> : <span />}
                                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={() => fileInputRef.current?.click()}>
                                    <FileUp className="h-3.5 w-3.5" />
                                    Select file
                                </Button>
                                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
                            </div>
                            <FormControl>
                                <Textarea rows={4} placeholder={placeholder} {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : (
                <FormField
                    control={form.control}
                    name={pathName}
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input placeholder="/path/to/certificate.pem" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}
        </div>
    );
}

export function TLSConnectionForm({ form, connectionType }: { form: UseFormReturn<any>; connectionType?: string }) {
    const mode = form.watch('tls.mode') ?? 'disable';
    const modeOptions = connectionType === 'sqlserver' ? TLS_MODE_OPTIONS.sqlserver : TLS_MODE_OPTIONS.default;
    const enabled = mode !== 'disable';

    return (
        <div className="flex flex-col gap-4 rounded-lg bg-background/60 p-4">
            <FormField
                control={form.control}
                name="tls.mode"
                render={({ field }) => (
                    <FormItem className="grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)] md:items-center">
                        <FormLabel>TLS mode</FormLabel>
                        <Select value={field.value ?? 'disable'} onValueChange={field.onChange}>
                            <FormControl>
                                <SelectTrigger className="w-full md:w-56">
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
                    <CertificateField
                        form={form}
                        label="CA certificate"
                        sourceName="tls.caCertificateSource"
                        pathName="tls.caCertificatePath"
                        contentName="tls.caCertificateContent"
                        hasContentName="tls.hasCaCertificateContent"
                        placeholder="Paste PEM-formatted CA certificate"
                    />
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

                    <div className="grid gap-4 md:grid-cols-2">
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
                </>
            ) : null}
        </div>
    );
}
