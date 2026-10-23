'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { createOrganization, slugifyOrganizationName } from '@/lib/organization/api';

export default function CreateOrganizationClient() {
    const router = useRouter();
    const [name, setName] = useState('');

    const mutation = useMutation({
        mutationFn: () =>
            createOrganization({
                name: name.trim(),
                slug: `${slugifyOrganizationName(name)}-${crypto.randomUUID().slice(0, 8)}`,
            }),
        onSuccess: organization => {
            toast.success('Organization created');
            router.push(`/${organization.slug}`);
            router.refresh();
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to create organization');
        },
    });

    return (
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-12">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Create organization</CardTitle>
                    <CardDescription>
                        Start a new workspace for your team. You can invite more members after creation.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="create-organization-name">Organization name</Label>
                        <Input
                            id="create-organization-name"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            placeholder="My workspace"
                        />
                    </div>
                    <Button
                        className="w-full"
                        onClick={() => mutation.mutate()}
                        disabled={!name.trim() || mutation.isPending}
                    >
                        {mutation.isPending ? 'Creating...' : 'Create organization'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
