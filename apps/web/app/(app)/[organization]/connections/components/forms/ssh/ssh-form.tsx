'use client';

import { useTranslations } from 'next-intl';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { RadioGroup, RadioGroupItem } from '@/registry/new-york-v4/ui/radio-group';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { cn } from '@/lib/utils';

export default function SSHConnectionForm(props: { form: UseFormReturn<any> }) {
    const { form } = props;
    const sshEnabled = form.watch('ssh.enabled');
    const authMethod = form.watch('ssh.authMethod');
    const t = useTranslations('Connections.ConnectionContent');

    return (
        <div className={cn('space-y-4 rounded-lg bg-background/60 p-4', !sshEnabled && 'opacity-50 pointer-events-none')}>
            
            <div className="flex flex-col gap-4 md:flex-row">
                {/* sshHost */}
                <FormField
                    control={form.control}
                    name="ssh.host"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>{t('SSH Host')}</FormLabel>
                            <FormControl>
                                <Input placeholder={t('Hostname or IP address')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* sshPort */}
                <FormField
                    control={form.control}
                    name="ssh.port"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>{t('SSH Port')}</FormLabel>
                            <FormControl>
                                <Input
                                    inputMode="numeric"
                                    placeholder="22"
                                    value={field.value?.toString() ?? ''}
                                    onChange={e => {
                                        const raw = e.target.value;
                                        const next = raw === '' ? null : Number(raw);
                                        field.onChange(Number.isNaN(next) ? field.value : next);
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            
            <FormField
                control={form.control}
                name="ssh.username"
                render={({ field }) => (
                    <FormItem className="w-full">
                        <FormLabel>{t('SSH User')}</FormLabel>
                        <FormControl>
                            <Input placeholder={t('SSH User')} {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            
            <FormField
                control={form.control}
                name="ssh.authMethod"
                render={({ field }) => (
                    <FormItem className="w-full">
                        <FormLabel>{t('Authentication Method')}</FormLabel>
                        <FormControl>
                            <RadioGroup className="flex flex-row gap-4" value={field.value} onValueChange={field.onChange}>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="password" id="ssh-auth-password" />
                                    <Label htmlFor="ssh-auth-password">{t('Password')}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="private_key" id="ssh-auth-key" />
                                    <Label htmlFor="ssh-auth-key">{t('Private Key')}</Label>
                                </div>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {authMethod === 'password' ? (
                <FormField
                    control={form.control}
                    name="ssh.password"
                    render={({ field }) => (
                        <FormItem className="w-full">
                            <FormLabel>{t('SSH Password')}</FormLabel>
                            <FormControl>
                                <Input type="password" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : (
                <>
                    <FormField
                        control={form.control}
                        name="ssh.privateKey"
                        render={({ field }) => (
                            <FormItem className="w-full">
                                <FormLabel>{t('SSH Private Key')}</FormLabel>
                                <FormControl>
                                    <Textarea rows={4} placeholder={t('SSH Private Key Placeholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="ssh.passphrase"
                        render={({ field }) => (
                            <FormItem className="w-full">
                                <FormLabel>{t('Private Key Passphrase')}</FormLabel>
                                <FormControl>
                                    <Input placeholder={t('Private Key Passphrase (optional)')} type="password" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </>
            )}
        </div>
    );
}
