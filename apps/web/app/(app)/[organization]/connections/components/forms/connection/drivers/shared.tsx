import { CircleHelp } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/registry/new-york-v4/ui/form';
import { Input } from '@/registry/new-york-v4/ui/input';

export function FieldHelp({ text }: { text: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Show field help"
                >
                    <CircleHelp className="h-4 w-4" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={6} className="max-w-64 text-left leading-relaxed">
                {text}
            </TooltipContent>
        </Tooltip>
    );
}

export function PortField({
    form,
    name,
    label,
    placeholder,
    helpText,
    required = false,
}: {
    form: UseFormReturn<any>;
    name: string;
    label: string;
    placeholder: string;
    helpText: string;
    required?: boolean;
}) {
    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className="space-y-2">
                    <FormLabel className="flex items-center gap-1.5">
                        <span>
                            {label}
                            {required ? <span className="text-destructive"> *</span> : null}
                        </span>
                        <FieldHelp text={helpText} />
                    </FormLabel>
                    <FormControl>
                        <Input
                            inputMode="numeric"
                            placeholder={placeholder}
                            value={field.value?.toString() ?? ''}
                            onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') {
                                    field.onChange('');
                                    return;
                                }
                                const next = Number(raw);
                                if (!Number.isNaN(next)) {
                                    field.onChange(next);
                                }
                            }}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
