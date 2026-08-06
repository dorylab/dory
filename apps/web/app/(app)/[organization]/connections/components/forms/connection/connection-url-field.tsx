import { useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';
import { FormLabel } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { CONNECTION_URL_TYPES, getConnectionUrlPlaceholder, parseConnectionUrl } from './drivers/connection-url';

export function supportsConnectionUrl(type?: string): boolean {
    return Boolean(type && CONNECTION_URL_TYPES.has(type));
}

export function ConnectionUrlField({ form, type }: { form: UseFormReturn<FieldValues>; type: string }) {
    const t = useTranslations('Connections.ConnectionContent');
    const [value, setValue] = useState('');
    const [error, setError] = useState(false);
    const inputId = `${type}-connection-url`;

    const applyUrl = (rawValue: string, showError: boolean) => {
        const parsed = parseConnectionUrl(type, rawValue);
        if (!parsed) {
            if (showError && rawValue.trim()) setError(true);
            return false;
        }

        for (const [name, nextValue] of Object.entries(parsed.connection)) {
            form.setValue(`connection.${name}`, nextValue, {
                shouldDirty: true,
                shouldValidate: false,
            });
        }
        for (const [name, nextValue] of Object.entries(parsed.identity)) {
            form.setValue(`identity.${name}`, nextValue, {
                shouldDirty: true,
                shouldValidate: false,
            });
        }
        if (parsed.tlsMode) {
            form.setValue('tls.mode', parsed.tlsMode, {
                shouldDirty: true,
                shouldValidate: false,
            });
        }

        form.clearErrors([
            'connection.host',
            'connection.port',
            'connection.httpPort',
            'connection.database',
            'connection.path',
            'connection.accountId',
            'identity.username',
            'identity.password',
        ]);
        setError(false);
        return true;
    };

    return (
        <div className="space-y-2">
            <FormLabel htmlFor={inputId} className="flex items-center gap-1.5">
                <span>{t('Connection URL')}</span>
                <span className="text-xs font-normal text-muted-foreground">({t('Optional')})</span>
            </FormLabel>
            <div className="flex gap-2">
                <Input
                    id={inputId}
                    value={value}
                    placeholder={getConnectionUrlPlaceholder(type)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error}
                    aria-describedby={error ? `${type}-connection-url-error` : undefined}
                    onChange={event => {
                        const nextValue = event.target.value;
                        setValue(nextValue);
                        setError(false);
                        applyUrl(nextValue, false);
                    }}
                    onBlur={() => applyUrl(value, true)}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label={t('Parse Connection URL')}
                    title={t('Parse Connection URL')}
                    disabled={!value.trim()}
                    onClick={() => applyUrl(value, true)}
                >
                    <Link2 className="size-4" />
                </Button>
            </div>
            {error ? (
                <p id={`${type}-connection-url-error`} className="text-sm font-medium text-destructive" aria-live="polite">
                    {t('Invalid Connection URL')}
                </p>
            ) : (
                <p className="text-xs text-muted-foreground">{t('Connection URL Help')}</p>
            )}
        </div>
    );
}
