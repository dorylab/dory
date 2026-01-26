import { InputPassword } from '@/components/originui/input-password';
import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { useTranslations } from 'next-intl';
import RequiredMark from '../../require-mark';

export default function IdentitiyForm({ form }: { form: UseFormReturn<any> }) {
    const { control } = form;
    const t = useTranslations('Connections.ConnectionContent');
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

            
            <FormField
                control={control}
                name="identity.password"
                render={({ field }) => (
                    <FormItem className="flex-1">
                        <FormLabel>{t('Password Optional')}</FormLabel>
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
