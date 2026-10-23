'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { acceptInvitation, listUserInvitations, rejectInvitation } from '@/lib/organization/api';

export default function AcceptInvitationClient({ invitationId }: { invitationId: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const invitationsQuery = useQuery({
        queryKey: ['organization-user-invitations'],
        queryFn: () => listUserInvitations(),
    });

    const invitation = invitationsQuery.data?.find(item => item.id === invitationId);

    const acceptMutation = useMutation({
        mutationFn: () => acceptInvitation({ invitationId }),
        onSuccess: async () => {
            toast.success('Invitation accepted');
            await queryClient.invalidateQueries({ queryKey: ['organization-user-invitations'] });
            await queryClient.invalidateQueries({ queryKey: ['organization-list'] });
            const nextSlug = invitation?.organizationSlug;
            router.push(nextSlug ? `/${nextSlug}` : '/');
            router.refresh();
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to accept invitation');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: () => rejectInvitation({ invitationId }),
        onSuccess: async () => {
            toast.success('Invitation rejected');
            await queryClient.invalidateQueries({ queryKey: ['organization-user-invitations'] });
            router.push('/');
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to reject invitation');
        },
    });

    return (
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-12">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Organization invitation</CardTitle>
                    <CardDescription>
                        {invitation
                            ? `Join ${invitation.organizationName ?? invitation.organizationId} as ${invitation.role}.`
                            : 'This invitation may have expired, been cancelled, or belongs to a different email address.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {invitation ? (
                        <>
                            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                                <div><strong>Organization:</strong> {invitation.organizationName ?? invitation.organizationId}</div>
                                <div><strong>Role:</strong> {invitation.role}</div>
                                <div><strong>Expires:</strong> {new Date(invitation.expiresAt).toLocaleString()}</div>
                            </div>
                            <div className="flex gap-3">
                                <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                                    {acceptMutation.isPending ? 'Accepting...' : 'Accept invitation'}
                                </Button>
                                <Button variant="outline" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                                    {rejectMutation.isPending ? 'Rejecting...' : 'Reject invitation'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <Button variant="outline" onClick={() => router.push('/')}>
                            Back to app
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
