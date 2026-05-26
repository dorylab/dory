'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { getFullOrganization, getOrganizationAccess, slugifyOrganizationName, updateOrganization } from '@/lib/organization/api';

function replaceOrganizationInPath(pathname: string, currentSlug: string, nextSlug: string) {
    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length) {
        return `/${nextSlug}/connections`;
    }

    if (segments[0] === currentSlug) {
        segments[0] = nextSlug;
        return `/${segments.join('/')}`;
    }

    return `/${nextSlug}/connections`;
}

export function OrganizationPanel() {
    const params = useParams<{ organization: string }>();
    const pathname = usePathname();
    const organizationSlug = params.organization;
    const t = useTranslations('OrganizationSettings.Organization');
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');

    const organizationQuery = useQuery({
        queryKey: ['organization-full', organizationSlug],
        queryFn: () => getFullOrganization({ organizationSlug }),
    });
    const accessQuery = useQuery({
        queryKey: ['organization-access', organizationSlug],
        queryFn: () => getOrganizationAccess(),
    });

    useEffect(() => {
        if (!organizationQuery.data) return;
        setName(organizationQuery.data.name ?? '');
        setSlug(organizationQuery.data.slug ?? '');
    }, [organizationQuery.data]);

    const updateMutation = useMutation({
        mutationFn: () => {
            const normalizedSlug = slugifyOrganizationName(slug);
            if (!slug.trim()) {
                throw new Error(t('Errors.SlugRequired'));
            }

            if (normalizedSlug !== slug.trim()) {
                throw new Error(t('Errors.SlugInvalid'));
            }

            return updateOrganization({
                organizationId: organizationQuery.data!.id,
                name: name.trim(),
                slug: slug.trim(),
            });
        },
        onSuccess: async updated => {
            toast.success(t('Toasts.Updated'));
            await queryClient.invalidateQueries({ queryKey: ['organization-full'] });
            await queryClient.invalidateQueries({ queryKey: ['organization-list'] });
            if (updated?.slug && updated.slug !== organizationSlug) {
                window.location.assign(replaceOrganizationInPath(pathname, organizationSlug, updated.slug));
            }
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Toasts.UpdateFailed'));
        },
    });

    const organization = organizationQuery.data;
    const access = accessQuery.data;
    const canUpdate = Boolean(access?.permissions.organization.update);
    const isInitialLoading = organizationQuery.isLoading && !organization;

    if (isInitialLoading) {
        return (
            <div className="flex max-w-2xl flex-col gap-6">
                <div className="grid gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="grid gap-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="flex justify-end">
                    <Skeleton className="h-9 w-28" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <div className="grid gap-2">
                <Label htmlFor="organization-name">{t('Fields.Name')}</Label>
                <Input id="organization-name" value={name} onChange={event => setName(event.target.value)} disabled={!organization || !canUpdate || updateMutation.isPending} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="organization-slug">{t('Fields.Slug')}</Label>
                <Input id="organization-slug" value={slug} onChange={event => setSlug(event.target.value)} disabled={!organization || !canUpdate || updateMutation.isPending} />
            </div>
            <div className="flex items-center justify-end">
                <Button onClick={() => updateMutation.mutate()} disabled={!organization || !canUpdate || !name.trim() || !slug.trim() || updateMutation.isPending}>
                    {updateMutation.isPending ? t('Saving') : t('SaveChanges')}
                </Button>
            </div>
        </div>
    );
}
