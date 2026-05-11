import * as React from 'react';

import { cn } from '@dory/web-utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                'inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground shadow-xs',
                className,
            )}
            {...props}
        />
    );
}

export { Kbd };
