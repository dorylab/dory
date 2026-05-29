'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { getFullOrganization } from '@/lib/organization/api';

export default function MembersSettingsPageClient() {
    const params = useParams<{ organization: string }>();
    const organizationSlug = params.organization;
    const t = useTranslations('OrganizationSettings.Members');

    const organizationQuery = useQuery({
        queryKey: ['organization-full', organizationSlug],
        queryFn: () => getFullOrganization({ organizationSlug }),
        retry: false,
    });

    const members = organizationQuery.data?.members ?? [];

    return (
        <div className="flex max-w-4xl flex-col gap-4">
            <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">{t('Title')}</h2>
                <p className="text-sm text-muted-foreground">{t('Description')}</p>
            </div>

            {organizationQuery.isError ? (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{organizationQuery.error instanceof Error ? organizationQuery.error.message : t('LoadFailed')}</AlertDescription>
                </Alert>
            ) : null}

            <div className="overflow-hidden rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('Table.Member')}</TableHead>
                            <TableHead>{t('Table.Role')}</TableHead>
                            <TableHead>{t('Table.Status')}</TableHead>
                            <TableHead>{t('Table.Joined')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {organizationQuery.isLoading ? (
                            Array.from({ length: 4 }).map((_, index) => (
                                <TableRow key={index}>
                                    <TableCell colSpan={4}>
                                        <Skeleton className="h-5 w-full" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : members.length ? (
                            members.map(member => (
                                <TableRow key={member.id}>
                                    <TableCell>
                                        <div className="font-medium">{member.user.name || member.user.email}</div>
                                        <div className="text-sm text-muted-foreground">{member.user.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {member.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="capitalize">{member.status ?? 'active'}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(member.joinedAt ?? member.createdAt)}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    {t('Empty')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function formatDate(value: string | Date | null | undefined) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
