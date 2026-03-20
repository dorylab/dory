'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Database, Eye, MinusCircle, PlusCircle, Table2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { hasPrivilegeForDisplay, type DisplayPrivilege } from '@/shared/privileges';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { useTranslations } from 'next-intl';

import type { PrivilegeTreeNode, PrivilegeNodeType, RolePrivilegeWithSource } from '../types';

const NODE_ICON_MAP: Record<PrivilegeNodeType, LucideIcon | null> = {
    root: null,
    database: Database,
    table: Table2,
    view: Eye,
    column: null,
};

type ScopedContext = { scope: 'database' | 'table' | 'view'; database: string; object?: string };

type PrivilegeDetailsSectionProps = {
    privilegeEntries: RolePrivilegeWithSource[];
    treeNodes: PrivilegeTreeNode[];
    treeColumns: string[];
    isScopedActionBusy: boolean;
    onOpenScopedGrantDialog: (node?: PrivilegeTreeNode) => void;
    onOpenScopedRevokeDialog: (node: PrivilegeTreeNode) => void;
    resolveScopedContext: (node: PrivilegeTreeNode) => ScopedContext | null;
    entityLabel?: string;
};

export function PrivilegeDetailsSection({
    privilegeEntries,
    treeNodes,
    treeColumns,
    isScopedActionBusy,
    onOpenScopedGrantDialog,
    onOpenScopedRevokeDialog,
    resolveScopedContext,
    entityLabel,
}: PrivilegeDetailsSectionProps) {
    const t = useTranslations('Privileges');
    const resolvedEntityLabel = entityLabel ?? t('Labels.User');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        const defaults = new Set<string>();
        treeNodes.forEach(node => {
            if (node.children.length) {
                defaults.add(node.id);
            }
        });
        setExpandedNodes(defaults);
    }, [treeNodes]);

    const flattenedRows = useMemo(() => {
        const rows: PrivilegeTreeNode[] = [];
        const walk = (node: PrivilegeTreeNode) => {
            rows.push(node);
            if (node.children.length && expandedNodes.has(node.id)) {
                node.children.forEach(child => walk(child));
            }
        };
        treeNodes.forEach(node => walk(node));
        return rows;
    }, [expandedNodes, treeNodes]);

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    return (
        <Card className="flex-1">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>{t('PrivilegeDetails.Title')}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => onOpenScopedGrantDialog()} disabled={isScopedActionBusy}>
                    <PlusCircle className="mr-2 size-4" /> {t('PrivilegeDetails.AddPrivilege')}
                </Button>
            </CardHeader>
            <CardContent className="flex-1">
                {privilegeEntries.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        {t('PrivilegeDetails.EmptyEntity', { entity: resolvedEntityLabel })}
                    </div>
                ) : treeNodes.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">{t('PrivilegeDetails.EmptyScoped')}</div>
                ) : (
                    <ScrollArea className="max-h-[600px] w-full rounded-md border">
                        <Table className="[&>tbody>tr>*]:border [&>thead>tr>*]:border">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/3 min-w-[220px]">{t('PrivilegeDetails.Columns.Name')}</TableHead>
                                    {treeColumns.map(column => (
                                        <TableHead key={column} className="w-20 text-center">
                                            {column}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {flattenedRows.map(node => {
                                    const Icon = NODE_ICON_MAP[node.type];
                                    const context = resolveScopedContext(node);
                                    const canAddScoped = Boolean(context);
                                    const hasDirectPrivileges = node.directPrivileges.length > 0;
                                    return (
                                        <TableRow key={node.id}>
                                            <TableCell>
                                                <div className="flex items-center" style={{ paddingLeft: `${node.depth * 1.5}rem` }}>
                                                    {node.children.length > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleNode(node.id)}
                                                            className="inline-flex size-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:text-foreground focus:outline-none focus-visible:border-ring"
                                                        >
                                                            {expandedNodes.has(node.id) ? (
                                                                <ChevronDown className="size-4" />
                                                            ) : (
                                                                <ChevronRight className="size-4" />
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex size-6 shrink-0" />
                                                    )}
                                                    <div className="ml-2 flex items-center gap-2">
                                                        {Icon ? (
                                                            <Icon className="size-4 text-muted-foreground" aria-hidden />
                                                        ) : (
                                                            <span className="inline-flex size-4" />
                                                        )}
                                                        <span className="font-medium text-sm text-foreground">{node.name}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {treeColumns.map(column => {
                                                const active =
                                                    node.hasAll ||
                                                    hasPrivilegeForDisplay(node.privileges, column as DisplayPrivilege);
                                                return (
                                                    <TableCell key={`${node.id}-${column}`} className="text-center">
                                                        {active ? <Check className="mx-auto size-4 text-emerald-500" /> : null}
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell className="text-right">
                                                {(canAddScoped || hasDirectPrivileges) && (
                                                    <div className="flex justify-end gap-2">
                                                        {canAddScoped ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => onOpenScopedGrantDialog(node)}
                                                                disabled={isScopedActionBusy}
                                                            >
                                                                <PlusCircle className="size-4" />
                                                            </Button>
                                                        ) : null}
                                                        {hasDirectPrivileges ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-destructive hover:text-destructive"
                                                                onClick={() => onOpenScopedRevokeDialog(node)}
                                                                disabled={isScopedActionBusy}
                                                            >
                                                                <MinusCircle className="size-4" />
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}
