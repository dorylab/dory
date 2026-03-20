import { UseFormReturn, useWatch } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { useTranslations } from 'next-intl';
import RequiredMark from '../../require-mark';
import { CONNECTION_TYPE_OPTIONS, getConnectionDriver } from './drivers';

export default function ConnectionForm(props: { form: UseFormReturn<any> }) {
    const { form } = props;
    const { control } = form;
    const t = useTranslations('Connections.ConnectionContent');
    const connectionType = useWatch({
        control,
        name: 'connection.type',
    });
    const driver = getConnectionDriver(connectionType);
    const DriverFields = driver.FormComponent;

    const handleTypeChange = (nextType: string, onChange: (value: string) => void) => {
        const nextDriver = getConnectionDriver(nextType);
        const currentConnection = form.getValues('connection') ?? {};
        const nextDefaults = nextDriver.createDefaults();

        onChange(nextType);

        form.setValue('connection.host', currentConnection.host ?? nextDefaults.host, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.port', nextDefaults.port, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.httpPort', nextDefaults.httpPort, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.database', nextDefaults.database, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.ssl', nextDefaults.ssl, { shouldDirty: true, shouldValidate: false });
        form.setValue('connection.description', currentConnection.description ?? nextDefaults.description, {
            shouldDirty: true,
            shouldValidate: false,
        });
        form.setValue('connection.environment', currentConnection.environment ?? nextDefaults.environment, {
            shouldDirty: true,
            shouldValidate: false,
        });
        form.setValue('connection.tags', currentConnection.tags ?? nextDefaults.tags, {
            shouldDirty: true,
            shouldValidate: false,
        });

        form.clearErrors([
            'connection.type',
            'connection.host',
            'connection.port',
            'connection.httpPort',
            'connection.database',
            'connection.ssl',
        ]);
    };

    return (
        <div className="space-y-4">
            
            <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-start">
                
                <FormField
                    control={control}
                    name="connection.name"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>
                                {t('Connection Name')}
                                <RequiredMark />
                            </FormLabel>
                            <FormControl>
                                <Input placeholder={t('Connection Name Placeholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                
                <FormField
                    control={control}
                    name="connection.type"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>
                                {t('Type')}
                                <RequiredMark />
                            </FormLabel>
                            <Select value={field.value} onValueChange={value => handleTypeChange(value, field.onChange)}>
                                <FormControl className="w-full">
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Select Database Type')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {CONNECTION_TYPE_OPTIONS.map(option => (
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
            </div>
            <DriverFields key={connectionType} form={form} />
        </div>
    );
}
