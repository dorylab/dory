'use client';

import { Check } from 'lucide-react';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { useTranslations } from 'next-intl';

type GlobalPrivilegesSectionProps = {
    columns: string[];
    hasGlobalPrivileges: boolean;
    hasAllGlobalPrivileges: boolean;
    globalPrivilegeSet: Set<string>;
    extraGlobalPrivileges: string[];
    onGrant: () => void;
    onRevoke: () => void;
    canGrant: boolean;
    canRevoke: boolean;
    isBusy: boolean;
    entityLabel?: string;
};

export function GlobalPrivilegesSection({
    columns,
    hasGlobalPrivileges,
    hasAllGlobalPrivileges,
    globalPrivilegeSet,
    extraGlobalPrivileges,
    onGrant,
    onRevoke,
    canGrant,
    canRevoke,
    isBusy,
    entityLabel,
}: GlobalPrivilegesSectionProps) {
    const t = useTranslations('Privileges');
    const resolvedEntityLabel = entityLabel ?? t('Labels.User');
    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>{t('GlobalPrivileges.Title')}</CardTitle>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={onGrant} disabled={!canGrant || isBusy}>
                        {t('Actions.Add')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={onRevoke} disabled={!canRevoke || isBusy}>
                        {t('Actions.Revoke')}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {hasGlobalPrivileges ? (
                    <>
                        <Table className="[&>tbody>tr>*]:border [&>thead>tr>*]:border">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/3 min-w-[220px]">{t('GlobalPrivileges.Columns.Name')}</TableHead>
                                    {columns.map(column => (
                                        <TableHead key={column} className="w-20 text-center">
                                            {column}
                                        </TableHead>
                                    ))}
                                    <TableHead className="w-20 text-right">{t('GlobalPrivileges.Columns.Actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>
                                        <span className="font-medium text-sm text-foreground">{t('GlobalPrivileges.GlobalLabel')}</span>
                                    </TableCell>
                                    {columns.map(column => {
                                        const active = hasAllGlobalPrivileges || globalPrivilegeSet.has(column);
                                        return (
                                            <TableCell key={`global-${column}`} className="text-center">
                                                {active ? <Check className="mx-auto size-4 text-emerald-500" /> : null}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            </TableBody>
                        </Table>
                        {hasAllGlobalPrivileges ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                                {t('GlobalPrivileges.AllGranted', { entity: resolvedEntityLabel })}
                            </p>
                        ) : null}
                        {extraGlobalPrivileges.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {extraGlobalPrivileges.map(privilege => (
                                    <Badge key={`extra-${privilege}`} variant="outline" className="text-xs">
                                        {privilege}
                                    </Badge>
                                ))}
                            </div>
                        ) : null}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('GlobalPrivileges.Empty')}</p>
                )}
            </CardContent>
        </Card>
    );
}
