import Link from 'next/link';

import type { ClickHouseRole } from '@/types/privileges';

import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/registry/new-york-v4/ui/table';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { toDisplayList } from '../utils';

export type RolesSectionProps = {
    isBusy: boolean;
    isLoading: boolean;
    roles?: ClickHouseRole[];
    onCreate: () => void;
    onEdit: (role: ClickHouseRole) => void;
    onDelete: (role: ClickHouseRole) => void;
};

export function RolesSection({ isBusy, isLoading, roles, onCreate, onEdit, onDelete }: RolesSectionProps) {
    const t = useTranslations('Privileges');
    const hasRoles = Boolean(roles && roles.length > 0);

    return (
        <Card className="flex h-full flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('Roles.Title')}</CardTitle>
                <Button onClick={onCreate} disabled={isBusy}>
                    <Plus className="mr-2 size-4" /> {t('Roles.Add')}
                </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" /> {t('Roles.Loading')}
                    </div>
                ) : hasRoles ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('Roles.Columns.RoleName')}</TableHead>
                                <TableHead>{t('Roles.Columns.PrivilegeCount')}</TableHead>
                                <TableHead>{t('Roles.Columns.GrantedUsers')}</TableHead>
                                <TableHead className="text-right">{t('Roles.Columns.Actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roles?.map(role => (
                                <TableRow key={role.name}>
                                    <TableCell className="font-medium">
                                        {role.name}
                                        {/* <Link
                                            href={`/privileges/role/${encodeURIComponent(role.name)}`}
                                            className="text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {role.name}
                                        </Link> */}
                                    </TableCell>
                                    <TableCell>{role.privileges.length}</TableCell>
                                    <TableCell>{toDisplayList(role.grantedToUsers, t('Common.EmptyValue'))}</TableCell>
                                    <TableCell className="space-x-2 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(role)}>
                                            {t('Actions.Edit')}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => onDelete(role)}
                                        >
                                            {t('Actions.Delete')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">{t('Roles.Empty')}</div>
                )}
            </CardContent>
        </Card>
    );
}
