'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { getFullOrganization, getOrganizationAccess, slugifyOrganizationName, updateOrganization } from '@/lib/organization/api';

export default function OrganizationSettingsPage() {
    const params = useParams<{ organization: string }>();
    const organizationSlug = params.organization;
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
        mutationFn: () =>
            updateOrganization({
                organizationId: organizationQuery.data!.id,
                name: name.trim(),
                slug: slug.trim(),
            }),
        onSuccess: async updated => {
            toast.success('Organization updated');
            await queryClient.invalidateQueries({ queryKey: ['organization-full'] });
            await queryClient.invalidateQueries({ queryKey: ['organization-list'] });
            if (updated?.slug && updated.slug !== organizationSlug) {
                window.location.assign(`/${updated.slug}/settings/organization`);
            }
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to update organization');
        },
    });

    const organization = organizationQuery.data;
    const access = accessQuery.data;
    const canUpdate = Boolean(access?.permissions.organization.update);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>
                    Update the public name and slug used in the workspace URL.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-2">
                    <Label htmlFor="organization-name">Name</Label>
                    <Input
                        id="organization-name"
                        value={name}
                        onChange={event => {
                            const nextName = event.target.value;
                            setName(nextName);
                            if (!slug.trim() || slug === slugifyOrganizationName(name)) {
                                setSlug(slugifyOrganizationName(nextName));
                            }
                        }}
                        disabled={!organization || !canUpdate || updateMutation.isPending}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="organization-slug">Slug</Label>
                    <Input
                        id="organization-slug"
                        value={slug}
                        onChange={event => setSlug(slugifyOrganizationName(event.target.value))}
                        disabled={!organization || !canUpdate || updateMutation.isPending}
                    />
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                    <div>
                        <div className="font-medium">Organization ID</div>
                        <div className="text-muted-foreground">{organization?.id ?? 'Loading...'}</div>
                    </div>
                    <Button
                        onClick={() => updateMutation.mutate()}
                        disabled={!organization || !canUpdate || !name.trim() || !slug.trim() || updateMutation.isPending}
                    >
                        {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
                </div>
                {!canUpdate ? (
                    <p className="text-sm text-muted-foreground">
                        Your current role does not allow updating organization settings.
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}

