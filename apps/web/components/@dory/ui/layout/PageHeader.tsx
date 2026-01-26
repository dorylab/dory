'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ChevronLeft } from 'lucide-react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/registry/new-york-v4/ui/breadcrumb';
import { useTranslations } from 'next-intl';

export function PageHeader({
    title,
    description,
    breadcrumbs,
    onBack,
    backText,
    rightSlot,
    className,
    sticky = false,
}: {
    title: string | ReactNode;
    description?: string | ReactNode;
    breadcrumbs?: { label: string; href?: string }[];
    onBack?: () => void;
    backText?: string;
    rightSlot?: ReactNode;
    className?: string;
    sticky?: boolean;
}) {
    const t = useTranslations('DoryUI');
    const resolvedBackText = backText ?? t('PageHeader.Back');
    const router = useRouter();

    return (
        <div
            className={cn(
                sticky &&
                    // 关键：使用 top-[var(--page-header-offset,0px)]
                    'sticky top-[var(--page-header-offset,0px)] z-30 -mx-6 px-6 py-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60',
                className,
            )}
        >
            {!!breadcrumbs?.length && (
                <div className="mb-3">
                    <Breadcrumb>
                        <BreadcrumbList>
                            {breadcrumbs.map((bc, i) => (
                                <BreadcrumbItem key={`${bc.label}-${i}`}>
                                    {bc.href ? <BreadcrumbLink href={bc.href}>{bc.label}</BreadcrumbLink> : <BreadcrumbPage>{bc.label}</BreadcrumbPage>}
                                    {i < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                                </BreadcrumbItem>
                            ))}
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            )}

            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {onBack && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => (onBack ? onBack() : router.back())}
                                className="shrink-0"
                                aria-label={typeof resolvedBackText === 'string' ? resolvedBackText : undefined}
                                title={typeof resolvedBackText === 'string' ? resolvedBackText : undefined}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
                    </div>
                    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
                </div>

                {rightSlot ? <div className="flex shrink-0 items-center gap-2">{rightSlot}</div> : null}
            </div>
        </div>
    );
}
