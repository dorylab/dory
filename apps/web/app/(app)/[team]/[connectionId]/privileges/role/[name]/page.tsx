'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import type { ClickHouseRole } from '@/types/privileges';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import {
    fetchClickHouseRole,
    fetchPrivilegeTargets,
    grantRoleGlobalPrivilegesApi,
    revokeRoleGlobalPrivilegesApi,
    grantRoleScopedPrivilegesApi,
    revokeRoleScopedPrivilegesApi,
    type ScopedPrivilegePayload,
} from '../../request';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import {
    DATABASE_PRIVILEGES,
    DISPLAY_PRIVILEGE_SET,
    GLOBAL_PRIVILEGE_OPTIONS,
    TABLE_PRIVILEGES,
    VIEW_PRIVILEGES,
} from '@/shared/privileges';
import { GlobalGrantDialog } from '../../_detail/components/global-grant-dialog';
import { GlobalPrivilegesSection } from '../../_detail/components/global-privileges-section';
import { GlobalRevokeDialog } from '../../_detail/components/global-revoke-dialog';
import { PrivilegeDetailsSection } from '../../_detail/components/privilege-details-section';
import { ScopedGrantDialog } from '../../_detail/components/scoped-grant-dialog';
import { ScopedRevokeDialog } from '../../_detail/components/scoped-revoke-dialog';
import { getParamValue, buildPrivilegeTree } from '../../_detail/helpers';
import { scopedGrantScopeAtom, scopedGrantDatabaseAtom, scopedGrantObjectAtom, scopedGrantSelectedPrivilegesAtom, scopedRevokeContextAtom, scopedRevokeSelectedPrivilegesAtom, resetGlobalGrantSelectionAtom, resetGlobalRevokeSelectionAtom, resetScopedGrantDialogAtom, resetScopedRevokeDialogAtom, ScopedRevokeContext } from '../../_detail/stores/dialog-atoms';
import { RolePrivilegeWithSource, SelectOption, PrivilegeTreeNode } from '../../_detail/types';

function renderAssigneeTags(values: string[] | undefined, emptyLabel: string) {
    if (!values || values.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {values.map(value => (
                <Badge key={value} variant="secondary" className="text-xs">
                    {value}
                </Badge>
            ))}
        </div>
    );
}

export default function RolePrivilegesPage() {
    const t = useTranslations('Privileges');
    const params = useParams();
    const encodedName = getParamValue(params?.name);
    const roleName = decodeURIComponent(encodedName ?? '');

    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id;
    const queryClient = useQueryClient();

    const roleQueryKey = ['privileges', 'role', connectionId, roleName] as const;
    const rolesListQueryKey = ['privileges', 'roles', connectionId] as const;

    const roleQuery = useQuery({
        queryKey: roleQueryKey,
        queryFn: () => fetchClickHouseRole(roleName, { errorMessage: t('Errors.FetchRole') }),
        enabled: Boolean(connectionId && roleName),
    });

    const role = roleQuery.data as ClickHouseRole | undefined;

    const privilegeEntries = useMemo<RolePrivilegeWithSource[]>(() => {
        if (!role?.privileges?.length) return [];
        return role.privileges.map(privilege => ({ ...privilege, source: 'direct' }));
    }, [role?.privileges]);

    const privilegeTree = useMemo(() => buildPrivilegeTree(privilegeEntries), [privilegeEntries]);
    const treeNodes = privilegeTree.nodes;
    const treeColumns = privilegeTree.columns;

    const normalizedGlobalPrivileges = useMemo(() => {
        const set = new Set<string>();
        Object.keys(privilegeTree.global.privileges).forEach(key => set.add(key));
        const ordered: string[] = [];
        if (privilegeTree.global.hasAll) {
            ordered.push('ALL');
        }
        GLOBAL_PRIVILEGE_OPTIONS.forEach(option => {
            if (set.has(option)) {
                ordered.push(option);
                set.delete(option);
            }
        });
        set.forEach(priv => ordered.push(priv));
        return ordered;
    }, [privilegeTree]);

    const globalPrivilegeSet = useMemo(() => new Set(normalizedGlobalPrivileges), [normalizedGlobalPrivileges]);
    const hasAllGlobalPrivileges = useMemo(
        () => ['ALL', 'ALL PRIVILEGES'].some(flag => globalPrivilegeSet.has(flag)),
        [globalPrivilegeSet],
    );
    const hasGlobalPrivileges = hasAllGlobalPrivileges || normalizedGlobalPrivileges.length > 0;
    const grantableGlobalPrivileges = useMemo(
        () => GLOBAL_PRIVILEGE_OPTIONS.filter(priv => !globalPrivilegeSet.has(priv)),
        [globalPrivilegeSet],
    );
    const revocableGlobalPrivileges = useMemo(
        () => normalizedGlobalPrivileges.slice(),
        [normalizedGlobalPrivileges],
    );
    const extraGlobalPrivileges = useMemo(
        () => normalizedGlobalPrivileges.filter(priv => !DISPLAY_PRIVILEGE_SET.has(priv) && !['ALL', 'ALL PRIVILEGES'].includes(priv)),
        [normalizedGlobalPrivileges],
    );

    const [globalGrantDialogOpen, setGlobalGrantDialogOpen] = useState(false);
    const [globalRevokeDialogOpen, setGlobalRevokeDialogOpen] = useState(false);
    const [scopedGrantDialogOpen, setScopedGrantDialogOpen] = useState(false);
    const [scopedRevokeDialogOpen, setScopedRevokeDialogOpen] = useState(false);
    const [databaseOptions, setDatabaseOptions] = useState<SelectOption[]>([]);
    const [tableOptionsByDatabase, setTableOptionsByDatabase] = useState<Record<string, SelectOption[]>>({});
    const [viewOptionsByDatabase, setViewOptionsByDatabase] = useState<Record<string, SelectOption[]>>({});

    const scopedGrantScope = useAtomValue(scopedGrantScopeAtom);
    const scopedGrantDatabase = useAtomValue(scopedGrantDatabaseAtom);
    const scopedGrantObject = useAtomValue(scopedGrantObjectAtom);
    const selectedScopedGrantPrivileges = useAtomValue(scopedGrantSelectedPrivilegesAtom);

    const setScopedGrantScope = useSetAtom(scopedGrantScopeAtom);
    const setScopedGrantDatabase = useSetAtom(scopedGrantDatabaseAtom);
    const setScopedGrantObject = useSetAtom(scopedGrantObjectAtom);
    const setSelectedScopedGrantPrivileges = useSetAtom(scopedGrantSelectedPrivilegesAtom);
    const setScopedRevokeContext = useSetAtom(scopedRevokeContextAtom);
    const setSelectedScopedRevokePrivileges = useSetAtom(scopedRevokeSelectedPrivilegesAtom);
    const resetGlobalGrantSelection = useSetAtom(resetGlobalGrantSelectionAtom);
    const resetGlobalRevokeSelection = useSetAtom(resetGlobalRevokeSelectionAtom);
    const resetScopedGrantDialog = useSetAtom(resetScopedGrantDialogAtom);
    const resetScopedRevokeDialog = useSetAtom(resetScopedRevokeDialogAtom);

    const scopedPrivilegeOptions = useMemo(() => {
        if (scopedGrantScope === 'database') return DATABASE_PRIVILEGES;
        if (scopedGrantScope === 'table') return TABLE_PRIVILEGES;
        return VIEW_PRIVILEGES;
    }, [scopedGrantScope]);

    const availableTableOptions = useMemo(
        () => tableOptionsByDatabase[scopedGrantDatabase] ?? [],
        [scopedGrantDatabase, tableOptionsByDatabase],
    );

    const availableViewOptions = useMemo(
        () => viewOptionsByDatabase[scopedGrantDatabase] ?? [],
        [scopedGrantDatabase, viewOptionsByDatabase],
    );

    const loadDatabaseOptions = useCallback(async () => {
        try {
            const options = await fetchPrivilegeTargets('database');
            setDatabaseOptions(options);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('Toasts.FetchDatabasesFailed'));
        }
    }, [t]);

    const loadTableOptions = useCallback(
        async (database: string, force = false) => {
            if (!database) return;
            if (!force && tableOptionsByDatabase[database]) return;
            try {
                const options = await fetchPrivilegeTargets('table', { database });
                setTableOptionsByDatabase(prev => ({ ...prev, [database]: options }));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('Toasts.FetchTablesFailed'));
            }
        },
        [t, tableOptionsByDatabase],
    );

    const loadViewOptions = useCallback(
        async (database: string, force = false) => {
            if (!database) return;
            if (!force && viewOptionsByDatabase[database]) return;
            try {
                const options = await fetchPrivilegeTargets('view', { database });
                setViewOptionsByDatabase(prev => ({ ...prev, [database]: options }));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('Toasts.FetchViewsFailed'));
            }
        },
        [t, viewOptionsByDatabase],
    );

    useEffect(() => {
        if (!scopedGrantDialogOpen) return;
        if (!databaseOptions.length) {
            loadDatabaseOptions();
        }
    }, [databaseOptions.length, loadDatabaseOptions, scopedGrantDialogOpen]);

    useEffect(() => {
        if (!scopedGrantDialogOpen) return;
        if (!scopedGrantDatabase) return;
        if (scopedGrantScope === 'table') {
            loadTableOptions(scopedGrantDatabase);
        } else if (scopedGrantScope === 'view') {
            loadViewOptions(scopedGrantDatabase);
        }
    }, [loadTableOptions, loadViewOptions, scopedGrantDatabase, scopedGrantDialogOpen, scopedGrantScope]);

    const invalidateRoleData = () => {
        queryClient.invalidateQueries({ queryKey: roleQueryKey });
        queryClient.invalidateQueries({ queryKey: rolesListQueryKey });
    };

    const grantGlobalPrivilegesMutation = useMutation({
        mutationFn: async (privileges: string[]) => {
            if (!roleName) throw new Error(t('Errors.RoleNotSpecified'));
            return grantRoleGlobalPrivilegesApi(roleName, privileges, { errorMessage: t('Errors.GrantGlobalFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.GlobalGranted'));
            invalidateRoleData();
            setGlobalGrantDialogOpen(false);
            resetGlobalGrantSelection();
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.GlobalGrantFailed'));
        },
    });

    const revokeGlobalPrivilegesMutation = useMutation({
        mutationFn: async (privileges: string[]) => {
            if (!roleName) throw new Error(t('Errors.RoleNotSpecified'));
            return revokeRoleGlobalPrivilegesApi(roleName, privileges, { errorMessage: t('Errors.RevokeGlobalFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.GlobalRevoked'));
            invalidateRoleData();
            setGlobalRevokeDialogOpen(false);
            resetGlobalRevokeSelection();
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.GlobalRevokeFailed'));
        },
    });

    const grantScopedPrivilegesMutation = useMutation({
        mutationFn: async (payload: ScopedPrivilegePayload) => {
            if (!roleName) throw new Error(t('Errors.RoleNotSpecified'));
            return grantRoleScopedPrivilegesApi(roleName, payload, { errorMessage: t('Errors.GrantScopedFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.ScopedGranted'));
            invalidateRoleData();
            setScopedGrantDialogOpen(false);
            setSelectedScopedGrantPrivileges([]);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.ScopedGrantFailed'));
        },
    });

    const revokeScopedPrivilegesMutation = useMutation({
        mutationFn: async (payload: ScopedPrivilegePayload) => {
            if (!roleName) throw new Error(t('Errors.RoleNotSpecified'));
            return revokeRoleScopedPrivilegesApi(roleName, payload, { errorMessage: t('Errors.RevokeScopedFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.ScopedRevoked'));
            invalidateRoleData();
            setScopedRevokeDialogOpen(false);
            setSelectedScopedRevokePrivileges([]);
            setScopedRevokeContext(null);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.ScopedRevokeFailed'));
        },
    });

    const handleGlobalGrantDialogChange = (nextOpen: boolean) => {
        setGlobalGrantDialogOpen(nextOpen);
        if (!nextOpen) {
            resetGlobalGrantSelection();
        }
    };

    const handleGlobalRevokeDialogChange = (nextOpen: boolean) => {
        setGlobalRevokeDialogOpen(nextOpen);
        if (!nextOpen) {
            resetGlobalRevokeSelection();
        }
    };

    const handleScopedGrantDialogChange = (nextOpen: boolean) => {
        setScopedGrantDialogOpen(nextOpen);
        if (!nextOpen) {
            resetScopedGrantDialog();
        }
    };

    const handleScopedRevokeDialogChange = (nextOpen: boolean) => {
        setScopedRevokeDialogOpen(nextOpen);
        if (!nextOpen) {
            resetScopedRevokeDialog();
        }
    };

    const handleConfirmGlobalGrant = (privileges: string[]) => {
        if (!privileges.length || grantGlobalPrivilegesMutation.isPending) return;
        grantGlobalPrivilegesMutation.mutate(privileges);
    };

    const handleConfirmGlobalRevoke = (privileges: string[]) => {
        if (!privileges.length || revokeGlobalPrivilegesMutation.isPending) return;
        revokeGlobalPrivilegesMutation.mutate(privileges);
    };

    const openGlobalGrantDialog = () => {
        resetGlobalGrantSelection();
        setGlobalGrantDialogOpen(true);
    };

    const openGlobalRevokeDialog = () => {
        resetGlobalRevokeSelection();
        setGlobalRevokeDialogOpen(true);
    };

    const resolveScopedContext = (
        node: PrivilegeTreeNode,
    ): { scope: 'database' | 'table' | 'view'; database: string; object?: string } | null => {
        if (node.type === 'database') {
            const segment = node.path.find(part => part.startsWith('database:'));
            if (!segment) return null;
            const database = segment.slice(segment.indexOf(':') + 1);
            if (!database || database === '*') return null;
            return { scope: 'database', database };
        }
        if (node.type === 'table' || node.type === 'view') {
            const dbSegment = node.path.find(part => part.startsWith('database:'));
            const tableSegment = node.path.find(part => part.startsWith('table:')) ?? node.path[node.path.length - 1];
            if (!dbSegment || !tableSegment) return null;
            const database = dbSegment.slice(dbSegment.indexOf(':') + 1);
            const object = tableSegment.slice(tableSegment.indexOf(':') + 1);
            if (!database || !object || object === '*') return null;
            return { scope: node.type === 'view' ? 'view' : 'table', database, object };
        }
        return null;
    };

    const openScopedGrantDialog = (node?: PrivilegeTreeNode) => {
        resetScopedGrantDialog();
        if (node) {
            const context = resolveScopedContext(node);
            if (context) {
                setScopedGrantScope(context.scope);
                setScopedGrantDatabase(context.database);
                if (context.scope !== 'database' && context.object) {
                    const ensureDatabaseOption = (option: SelectOption) => {
                        setDatabaseOptions(prev => {
                            if (prev.some(item => item.value === option.value)) return prev;
                            return [...prev, option];
                        });
                    };
                    ensureDatabaseOption({ label: context.database, value: context.database });
                    if (context.scope === 'table' && context.object) {
                        setTableOptionsByDatabase(prev => {
                            const existing = prev[context.database] ?? [];
                            if (existing.some(item => item.value === context.object)) return prev;
                            const updated: SelectOption[] = [...existing as any, { label: context.object, value: context.object }];
                            return { ...prev, [context.database]: updated };
                        });
                        setScopedGrantObject(context.object);
                    } else if (context.scope === 'view' && context.object) {
                        setViewOptionsByDatabase(prev => {
                            const existing = prev[context.database] ?? [];
                            if (existing.some(item => item.value === context.object)) return prev;
                            const updated: SelectOption[] = [...existing as any, { label: context.object, value: context.object }];
                            return { ...prev, [context.database]: updated };
                        });
                        setScopedGrantObject(context.object);
                    }
                    if (context.scope === 'table') {
                        loadTableOptions(context.database, true);
                    } else if (context.scope === 'view') {
                        loadViewOptions(context.database, true);
                    }
                }
            }
        }
        if (!databaseOptions.length) {
            loadDatabaseOptions();
        }
        setScopedGrantDialogOpen(true);
    };

    const openScopedRevokeDialog = (node: PrivilegeTreeNode) => {
        const context = resolveScopedContext(node);
        if (!context) return;
        const privileges = Array.from(new Set(node.directPrivileges.map(priv => priv.toUpperCase())));
        if (!privileges.length) return;
        setScopedRevokeContext({ ...context, privileges });
        setSelectedScopedRevokePrivileges(privileges);
        setScopedRevokeDialogOpen(true);
    };

    const handleConfirmScopedGrant = () => {
        if (!selectedScopedGrantPrivileges.length) return;
        if (!scopedGrantDatabase) {
            toast.error(t('Toasts.SelectDatabase'));
            return;
        }
        if (scopedGrantScope !== 'database' && !scopedGrantObject) {
            toast.error(t('Toasts.SelectObject'));
            return;
        }
        grantScopedPrivilegesMutation.mutate({
            scope: scopedGrantScope,
            database: scopedGrantDatabase,
            object: scopedGrantScope === 'database' ? null : scopedGrantObject,
            privileges: selectedScopedGrantPrivileges,
        });
    };

    const handleConfirmScopedRevoke = (context: ScopedRevokeContext, privileges: string[]) => {
        if (!privileges.length) return;
        revokeScopedPrivilegesMutation.mutate({
            scope: context.scope,
            database: context.database,
            object: context.object ?? null,
            privileges,
        });
    };

    const isGlobalActionBusy = grantGlobalPrivilegesMutation.isPending || revokeGlobalPrivilegesMutation.isPending;
    const isScopedActionBusy = grantScopedPrivilegesMutation.isPending || revokeScopedPrivilegesMutation.isPending;
    const hasRoleContext = Boolean(roleName);
    const canGrantGlobalPrivileges = hasRoleContext && grantableGlobalPrivileges.length > 0;
    const canRevokeGlobalPrivileges = hasRoleContext && revocableGlobalPrivileges.length > 0;

    const isLoading = roleQuery.isLoading;
    const hasError = roleQuery.isError;

    return (
        <div className="flex h-full flex-col gap-6 p-6">
            <header className="flex items-center justify-start">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" asChild className="h-9 w-9">
                        <Link href="/privileges" aria-label={t('Actions.BackToList')}>
                            <ArrowLeft className="size-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold">{t('RolePage.Title')}</h1>
                        <p className="text-muted-foreground text-sm">{t('RolePage.Description')}</p>
                    </div>
                </div>
            </header>

            {!connectionId ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        {t('RolePage.Empty.NoConnection')}
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <Card className="flex-1">
                    <CardContent className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" /> {t('RolePage.Loading')}
                    </CardContent>
                </Card>
            ) : hasError || !role ? (
                <Card className="flex-1">
                    <CardContent className="flex h-full items-center justify-center text-muted-foreground">
                        {roleQuery.error instanceof Error ? roleQuery.error.message : t('RolePage.LoadFailed')}
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-1 flex-col gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>{role.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('RolePage.Fields.GrantedUsers')}</p>
                                <div className="mt-2">{renderAssigneeTags(role.grantedToUsers, t('Common.EmptyValue'))}</div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('RolePage.Fields.GrantedRoles')}</p>
                                <div className="mt-2">{renderAssigneeTags(role.grantedToRoles, t('Common.EmptyValue'))}</div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('RolePage.Fields.PrivilegeCount')}</p>
                                <p className="mt-2 text-sm text-foreground">{role.privileges.length}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <GlobalPrivilegesSection
                        entityLabel={t('Labels.Role')}
                        columns={treeColumns}
                        hasGlobalPrivileges={hasGlobalPrivileges}
                        hasAllGlobalPrivileges={hasAllGlobalPrivileges}
                        globalPrivilegeSet={globalPrivilegeSet}
                        extraGlobalPrivileges={extraGlobalPrivileges}
                        onGrant={openGlobalGrantDialog}
                        onRevoke={openGlobalRevokeDialog}
                        canGrant={canGrantGlobalPrivileges}
                        canRevoke={canRevokeGlobalPrivileges}
                        isBusy={isGlobalActionBusy}
                    />

                    <PrivilegeDetailsSection
                        entityLabel={t('Labels.Role')}
                        privilegeEntries={privilegeEntries}
                        treeNodes={treeNodes}
                        treeColumns={treeColumns}
                        isScopedActionBusy={isScopedActionBusy}
                        onOpenScopedGrantDialog={openScopedGrantDialog}
                        onOpenScopedRevokeDialog={openScopedRevokeDialog}
                        resolveScopedContext={resolveScopedContext}
                    />
                </div>
            )}

            <GlobalGrantDialog
                entityLabel={t('Labels.Role')}
                open={globalGrantDialogOpen}
                onOpenChange={handleGlobalGrantDialogChange}
                allPrivileges={GLOBAL_PRIVILEGE_OPTIONS}
                grantablePrivileges={grantableGlobalPrivileges}
                onConfirm={handleConfirmGlobalGrant}
                loading={grantGlobalPrivilegesMutation.isPending}
            />

            <GlobalRevokeDialog
                open={globalRevokeDialogOpen}
                onOpenChange={handleGlobalRevokeDialogChange}
                revocablePrivileges={revocableGlobalPrivileges}
                onConfirm={handleConfirmGlobalRevoke}
                loading={revokeGlobalPrivilegesMutation.isPending}
            />

            <ScopedGrantDialog
                open={scopedGrantDialogOpen}
                onOpenChange={handleScopedGrantDialogChange}
                databaseOptions={databaseOptions}
                tableOptions={availableTableOptions}
                viewOptions={availableViewOptions}
                privilegeOptions={scopedPrivilegeOptions}
                onConfirm={handleConfirmScopedGrant}
                loading={grantScopedPrivilegesMutation.isPending}
            />

            <ScopedRevokeDialog
                open={scopedRevokeDialogOpen}
                onOpenChange={handleScopedRevokeDialogChange}
                onConfirm={handleConfirmScopedRevoke}
                loading={revokeScopedPrivilegesMutation.isPending}
            />
        </div>
    );
}
