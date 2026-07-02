import { InputPassword } from '@/components/originui/input-password';
import { type FieldValues, UseFormReturn, useWatch } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { useTranslations } from 'next-intl';
import RequiredMark from '../../require-mark';

export default function IdentitiyForm({
    form,
    isEditMode = false,
    savePassword = true,
    onSavePasswordChange,
}: {
    form: UseFormReturn<FieldValues>;
    isEditMode?: boolean;
    savePassword?: boolean;
    onSavePasswordChange?: (checked: boolean) => void;
}) {
    const { control } = form;
    const t = useTranslations('Connections.ConnectionContent');
    const connectionType = useWatch({ control, name: 'connection.type' });
    const authMethod = useWatch({ control, name: 'connection.authMethod' });
    const isSnowflakeKeyPair = connectionType === 'snowflake' && authMethod === 'key_pair';

    return (
        <div className="space-y-4">
            
            {/* <FormField
                control={control}
                name="identity.name"
                render={({ field }) => (
                    <FormItem className="flex-1">
                        <FormLabel>
                            <RequiredMark />
                        </FormLabel>
                        <FormControl>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            /> */}

            
            <div className="flex flex-col gap-4 md:flex-row">
                <FormField
                    control={control}
                    name="identity.username"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>
                                {t('Database Username')}
                                <RequiredMark />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder={t('Database Username Placeholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            
            {isSnowflakeKeyPair ? (
                <>
                    <FormField
                        control={control}
                        name="identity.privateKey"
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormLabel>Private Key</FormLabel>
                                <FormControl>
                                    <Textarea
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="min-h-36 font-mono text-xs"
                                        placeholder="-----BEGIN PRIVATE KEY-----"
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                {isEditMode && savePassword ? <p className="text-xs text-muted-foreground">Leave blank to keep the saved private key.</p> : null}
                                {!savePassword ? <p className="text-xs text-muted-foreground">The private key will only be used for this test.</p> : null}
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Checkbox
                                        checked={savePassword}
                                        onCheckedChange={checked => {
                                            const nextChecked = checked === true;
                                            onSavePasswordChange?.(nextChecked);
                                        }}
                                    />
                                    <span>Save private key</span>
                                </label>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="identity.privateKeyPassphrase"
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormLabel>Private Key Passphrase</FormLabel>
                                <FormControl>
                                    <InputPassword type="password" autoComplete="new-password" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </>
            ) : (
                <FormField
                    control={control}
                    name="identity.password"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>{t('Password Optional')}</FormLabel>
                            <FormControl>
                                <InputPassword type="password" autoComplete="new-password" {...field} value={field.value ?? ''} />
                            </FormControl>
                            {isEditMode && savePassword ? <p className="text-xs text-muted-foreground">{t('Password Keep Saved Hint')}</p> : null}
                            {!savePassword ? <p className="text-xs text-muted-foreground">{t('Password Not Saved Hint')}</p> : null}
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Checkbox
                                    checked={savePassword}
                                    onCheckedChange={checked => {
                                        const nextChecked = checked === true;
                                        onSavePasswordChange?.(nextChecked);
                                    }}
                                />
                                <span>{t('Save Password')}</span>
                            </label>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}
        </div>
    );
}
