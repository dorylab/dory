import { Sparkles } from 'lucide-react';
import * as React from 'react';

import { cn } from '@dory/web-utils';

export function AISparkIcon({
    size = 24,
    className,
    loading = false,
    ...props
}: React.SVGProps<SVGSVGElement> & {
    size?: number;
    loading?: boolean;
}) {
    return <Sparkles {...props} width={size} height={size} className={cn('h-4 w-4 shrink-0 text-[#9460FF]', loading && 'animate-pulse', className)} />;
}
