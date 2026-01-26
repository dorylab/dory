import Link from 'next/link';

import type { ClickHouseUser } from '@/types/privileges';

import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
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

function renderRoleTags(roles: string[] | undefined, emptyLabel: string) {
    if (!roles || roles.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {roles.map(role => (
                <Badge key={role} variant="secondary" className="text-xs">
                    {role}
                </Badge>
            ))}
        </div>
    );
}

export type UsersSectionProps = {
    isBusy: boolean;
    isLoading: boolean;
    users?: ClickHouseUser[];
    onCreate: () => void;
    onEdit: (user: ClickHouseUser) => void;
    onDelete: (user: ClickHouseUser) => void;
};

export function UsersSection({ isBusy, isLoading, users, onCreate, onEdit, onDelete }: UsersSectionProps) {
    const t = useTranslations('Privileges');
    const hasUsers = Boolean(users && users.length > 0);

    return (
        <Card className="flex h-full flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('Users.Title')}</CardTitle>
                <Button onClick={onCreate} disabled={isBusy}>
                    <Plus className="mr-2 size-4" /> {t('Users.Add')}
                </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" /> {t('Users.Loading')}
                    </div>
                ) : hasUsers ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('Users.Columns.UserName')}</TableHead>
                                <TableHead>{t('Users.Columns.DefaultRole')}</TableHead>
                                <TableHead>{t('Users.Columns.GrantedRoles')}</TableHead>
                                
                                <TableHead className="text-right">{t('Users.Columns.Actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users?.map(user => (
                                <TableRow key={user.name}>
                                    <TableCell className="font-medium">
                                        {user.name}
                                        {/* <Link
                                            href={`/privileges/user/${encodeURIComponent(user.name)}`}
                                            className="text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {user.name}
                                        </Link> */}
                                    </TableCell>
                                    <TableCell>{renderRoleTags(user.defaultRoles, t('Common.EmptyValue'))}</TableCell>
                                    <TableCell>{renderRoleTags(user.grantedRoles, t('Common.EmptyValue'))}</TableCell>
                                    {/* <TableCell>
                                    </TableCell> */}
                                    <TableCell className="space-x-2 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(user)}>
                                            {t('Actions.Edit')}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => onDelete(user)}
                                        >
                                            {t('Actions.Delete')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">{t('Users.Empty')}</div>
                )}
            </CardContent>
        </Card>
    );
}
