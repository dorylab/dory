// components/form/error-placeholder.tsx
import { cn } from '@/lib/utils';
import { FormMessage } from '@/registry/new-york-v4/ui/form';
import { get } from 'lodash-es';
import { useTranslations } from 'next-intl';

interface ErrorPlaceholderProps {
    name: string;
    form: any;
}

export function ErrorPlaceholder({ name, form }: ErrorPlaceholderProps) {
    const hasError = !!get(form.formState.errors, name);
    const t = useTranslations('Connections');

    if (hasError) return <FormMessage />;
    return (
        <p
            className={cn('text-xs', 'text-transparent', {
                'h-4': hasError,
                'hidden': !hasError,
            })}
        >
            {t('Placeholder')}
        </p>
    );
}
