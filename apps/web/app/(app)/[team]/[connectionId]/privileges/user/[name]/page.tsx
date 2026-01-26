'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import type { ClickHouseRole, ClickHouseUser } from '@/types/privileges';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import {
    fetchClickHouseRoles,
    fetchClickHouseUser,
    grantUserGlobalPrivilegesApi,
    revokeUserGlobalPrivilegesApi,
    grantUserScopedPrivilegesApi,
    revokeUserScopedPrivilegesApi,
    fetchPrivilegeTargets,
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

export default function UserPrivilegesPage() {
    const t = useTranslations('Privileges');
    const params = useParams();
    const encodedName = getParamValue(params?.name);
    const userName = decodeURIComponent(encodedName ?? '');

    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id;

    const queryClient = useQueryClient();

    const userQuery = useQuery({
        queryKey: ['privileges', 'user', connectionId, userName],
        queryFn: () => fetchClickHouseUser(userName, { errorMessage: t('Errors.FetchUser') }),
        enabled: Boolean(connectionId && userName),
    });

    const rolesQuery = useQuery({
        queryKey: ['privileges', 'roles', connectionId],
        queryFn: () => fetchClickHouseRoles({ errorMessage: t('Errors.FetchRoles') }),
        enabled: Boolean(connectionId),
    });

    const user = userQuery.data as ClickHouseUser | undefined;
    const roles = rolesQuery.data as ClickHouseRole[] | undefined;
    const isLoading = userQuery.isLoading || rolesQuery.isLoading;
    const hasError = userQuery.isError;

    const availableRolesMap = useMemo(() => {
        if (!roles) return new Map<string, ClickHouseRole>();
        return new Map(roles.map(role => [role.name, role]));
    }, [roles]);

    const privilegeEntries = useMemo(() => {
        const entries: RolePrivilegeWithSource[] = [];
        if (user?.grantedRoles?.length) {
            for (const roleName of user.grantedRoles) {
                const role = availableRolesMap.get(roleName);
                if (!role) continue;
                for (const privilege of role.privileges) {
                    entries.push({ ...privilege, source: `role:${roleName}` });
                }
            }
        }

        if (user?.directPrivileges?.length) {
            for (const privilege of user.directPrivileges) {
                entries.push({ ...privilege, source: 'direct' });
            }
        }

        return entries;
    }, [availableRolesMap, user]);

    const privilegeTree = useMemo(() => buildPrivilegeTree(privilegeEntries), [privilegeEntries]);
    const treeNodes = privilegeTree.nodes;
    const treeColumns = privilegeTree.columns;

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

    const normalizedGlobalPrivileges = useMemo(() => {
        const source = user?.globalPrivileges ?? [];
        const set = new Set<string>();
        source.forEach(priv => {
            if (!priv) return;
            set.add(String(priv).toUpperCase());
        });
        const ordered: string[] = [];
        GLOBAL_PRIVILEGE_OPTIONS.forEach(priv => {
            if (set.has(priv)) ordered.push(priv);
        });
        set.forEach(priv => {
            if (!(GLOBAL_PRIVILEGE_OPTIONS as readonly string[]).includes(priv as typeof GLOBAL_PRIVILEGE_OPTIONS[number])) {
                ordered.push(priv);
            }
        });
        return ordered;
    }, [user?.globalPrivileges]);

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

    const grantGlobalPrivilegesMutation = useMutation({
        mutationFn: async (privileges: string[]) => {
            if (!userName) throw new Error(t('Errors.UserNotSpecified'));
            return grantUserGlobalPrivilegesApi(userName, privileges, { errorMessage: t('Errors.GrantGlobalFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.GlobalGranted'));
            queryClient.invalidateQueries({ queryKey: ['privileges', 'user', connectionId, userName] });
            setGlobalGrantDialogOpen(false);
            resetGlobalGrantSelection();
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.GlobalGrantFailed'));
        },
    });

    const revokeGlobalPrivilegesMutation = useMutation({
        mutationFn: async (privileges: string[]) => {
            if (!userName) throw new Error(t('Errors.UserNotSpecified'));
            return revokeUserGlobalPrivilegesApi(userName, privileges, { errorMessage: t('Errors.RevokeGlobalFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.GlobalRevoked'));
            queryClient.invalidateQueries({ queryKey: ['privileges', 'user', connectionId, userName] });
            setGlobalRevokeDialogOpen(false);
            resetGlobalRevokeSelection();
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.GlobalRevokeFailed'));
        },
    });

    const grantScopedPrivilegesMutation = useMutation({
        mutationFn: async (payload: ScopedPrivilegePayload) => {
            if (!userName) throw new Error(t('Errors.UserNotSpecified'));
            return grantUserScopedPrivilegesApi(userName, payload, { errorMessage: t('Errors.GrantScopedFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.ScopedGranted'));
            queryClient.invalidateQueries({ queryKey: ['privileges', 'user', connectionId, userName] });
            setScopedGrantDialogOpen(false);
            setSelectedScopedGrantPrivileges([]);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.ScopedGrantFailed'));
        },
    });

    const revokeScopedPrivilegesMutation = useMutation({
        mutationFn: async (payload: ScopedPrivilegePayload) => {
            if (!userName) throw new Error(t('Errors.UserNotSpecified'));
            return revokeUserScopedPrivilegesApi(userName, payload, { errorMessage: t('Errors.RevokeScopedFailed') });
        },
        onSuccess: () => {
            toast.success(t('Toasts.ScopedRevoked'));
            queryClient.invalidateQueries({ queryKey: ['privileges', 'user', connectionId, userName] });
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

    const isGlobalActionBusy = grantGlobalPrivilegesMutation.isPending || revokeGlobalPrivilegesMutation.isPending;
    const hasUserContext = Boolean(userName);
    const canGrantGlobalPrivileges = hasUserContext && grantableGlobalPrivileges.length > 0;
    const canRevokeGlobalPrivileges = hasUserContext && revocableGlobalPrivileges.length > 0;
    const isScopedActionBusy = grantScopedPrivilegesMutation.isPending || revokeScopedPrivilegesMutation.isPending;

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

    const openScopedGrantDialog = (node?: PrivilegeTreeNode) => {
        resetScopedGrantDialog();
        if (node) {
            const context = resolveScopedContext(node);
            if (context) {
                setScopedGrantScope(context.scope);
                setScopedGrantDatabase(context.database);
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
                        const updated: SelectOption[] = [...existing, { label: context.object!, value: context.object! }];
                        return {
                            ...prev,
                            [context.database]: updated,
                        };
                    });
                    setScopedGrantObject(context.object);
                } else if (context.scope === 'view' && context.object) {
                    setViewOptionsByDatabase(prev => {
                        const existing = prev[context.database] ?? [];
                        if (existing.some(item => item.value === context.object)) return prev;
                        const updated: SelectOption[] = [...existing, { label: context.object!, value: context.object! }];
                        return {
                            ...prev,
                            [context.database]: updated,
                        };
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
        // setScopedGrantSelectedPrivileges([]);
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
                        <h1 className="text-2xl font-semibold">{t('UserPage.Title')}</h1>
                        <p className="text-muted-foreground text-sm">{t('UserPage.Description')}</p>
                    </div>
                </div>
            </header>

            {!connectionId ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        {t('UserPage.Empty.NoConnection')}
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <Card className="flex-1">
                    <CardContent className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" /> {t('UserPage.Loading')}
                    </CardContent>
                </Card>
            ) : hasError || !user ? (
                <Card className="flex-1">
                    <CardContent className="flex h-full items-center justify-center text-muted-foreground">
                        {userQuery.error instanceof Error ? userQuery.error.message : t('UserPage.LoadFailed')}
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-1 flex-col gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>{user.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('UserPage.Fields.DefaultRoles')}</p>
                                <div className="mt-2">{renderRoleTags(user.defaultRoles, t('Common.EmptyValue'))}</div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('UserPage.Fields.GrantedRoles')}</p>
                                <div className="mt-2">{renderRoleTags(user.grantedRoles, t('Common.EmptyValue'))}</div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('UserPage.Fields.HostRestriction')}</p>
                                <p className="mt-2 text-sm text-foreground">
                                    {user.allowAllHosts
                                        ? t('UserPage.Fields.AnyHost')
                                        : user.allowedClientHosts?.length
                                            ? user.allowedClientHosts.join(', ')
                                            : t('UserPage.Fields.NotConfigured')}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('UserPage.Fields.AuthType')}</p>
                                <p className="mt-2 text-sm text-foreground">{user.authType ?? t('Common.EmptyValue')}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <GlobalPrivilegesSection
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
