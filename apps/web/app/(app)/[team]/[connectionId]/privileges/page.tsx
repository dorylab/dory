'use client';

import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Users as UsersIcon, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import {
    createClickHouseRoleApi,
    createClickHouseUserApi,
    deleteClickHouseRoleApi,
    deleteClickHouseUserApi,
    fetchClickHouseRoles,
    fetchClickHouseUsers,
    fetchClickHouseClusters,
    updateClickHouseRoleApi,
    updateClickHouseUserApi,
} from './request';
import type { ClickHouseRole, ClickHouseUser, RolePrivilege } from '@/types/privileges';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/registry/new-york-v4/ui/tabs';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { RoleDialog } from './components/role-dialog';
import { UserDialog } from './components/user-dialog';
import { RolesSection } from './components/roles-section';
import { UsersSection } from './components/users-section';
import type { FormMode, RoleFormValues, UserFormValues } from './types';
import { parseList } from './utils';
import { currentConnectionAtom } from '@/shared/stores/app.store';

const DEFAULT_TAB = 'users';

export default function PrivilegesPage() {
    const t = useTranslations('Privileges');
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id;
    const queryClient = useQueryClient();

    const usersQueryKey = useMemo(() => ['privileges', 'users', connectionId], [connectionId]);
    const rolesQueryKey = useMemo(() => ['privileges', 'roles', connectionId], [connectionId]);
    const clustersQueryKey = useMemo(() => ['privileges', 'clusters', connectionId], [connectionId]);

    const usersQuery = useQuery({
        queryKey: usersQueryKey,
        queryFn: () => fetchClickHouseUsers({ errorMessage: t('Errors.FetchUsers') }),
        enabled: Boolean(connectionId),
    });

    const rolesQuery = useQuery({
        queryKey: rolesQueryKey,
        queryFn: () => fetchClickHouseRoles({ errorMessage: t('Errors.FetchRoles') }),
        enabled: Boolean(connectionId),
    });

    const clustersQuery = useQuery({
        queryKey: clustersQueryKey,
        queryFn: () => fetchClickHouseClusters({ errorMessage: t('Errors.FetchClusters') }),
        enabled: Boolean(connectionId),
    });

    const availableRoleNames = useMemo(() => {
        const names = rolesQuery.data?.map(role => role.name).filter(Boolean) ?? [];
        return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'en'));
    }, [rolesQuery.data]);
    const clusterOptions = clustersQuery.data ?? [];
    const isClustersLoading = clustersQuery.isLoading;

    const [userModalOpen, setUserModalOpen] = useState(false);
    const [userModalMode, setUserModalMode] = useState<FormMode>('create');
    const [editingUser, setEditingUser] = useState<ClickHouseUser | null>(null);
    const [pendingDeleteUser, setPendingDeleteUser] = useState<ClickHouseUser | null>(null);

    const [roleModalOpen, setRoleModalOpen] = useState(false);
    const [roleModalMode, setRoleModalMode] = useState<FormMode>('create');
    const [editingRole, setEditingRole] = useState<ClickHouseRole | null>(null);
    const [pendingDeleteRole, setPendingDeleteRole] = useState<ClickHouseRole | null>(null);

    const createUserMutation = useMutation({
        mutationFn: (payload: Parameters<typeof createClickHouseUserApi>[0]) =>
            createClickHouseUserApi(payload, { errorMessage: t('Errors.CreateUser') }),
        onSuccess: () => {
            toast.success(t('Toasts.UserCreated'));
            queryClient.invalidateQueries({ queryKey: usersQueryKey });
            queryClient.invalidateQueries({ queryKey: rolesQueryKey });
            setUserModalOpen(false);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.UserCreateFailed'));
        },
    });

    const updateUserMutation = useMutation({
        mutationFn: ({ name, payload }: { name: string; payload: Parameters<typeof updateClickHouseUserApi>[1] }) =>
            updateClickHouseUserApi(name, payload, { errorMessage: t('Errors.UpdateUser') }),
        onSuccess: () => {
            toast.success(t('Toasts.UserUpdated'));
            queryClient.invalidateQueries({ queryKey: usersQueryKey });
            queryClient.invalidateQueries({ queryKey: rolesQueryKey });
            setUserModalOpen(false);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.UserUpdateFailed'));
        },
    });

    const deleteUserMutation = useMutation({
        mutationFn: (name: string) => deleteClickHouseUserApi(name, { errorMessage: t('Errors.DeleteUser') }),
        onSuccess: () => {
            toast.success(t('Toasts.UserDeleted'));
            queryClient.invalidateQueries({ queryKey: usersQueryKey });
            queryClient.invalidateQueries({ queryKey: rolesQueryKey });
            setPendingDeleteUser(null);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.UserDeleteFailed'));
        },
    });

    const createRoleMutation = useMutation({
        mutationFn: (payload: Parameters<typeof createClickHouseRoleApi>[0]) =>
            createClickHouseRoleApi(payload, { errorMessage: t('Errors.CreateRole') }),
        onSuccess: () => {
            toast.success(t('Toasts.RoleCreated'));
            queryClient.invalidateQueries({ queryKey: rolesQueryKey });
            setRoleModalOpen(false);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.RoleCreateFailed'));
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ name, payload }: { name: string; payload: Parameters<typeof updateClickHouseRoleApi>[1] }) =>
            updateClickHouseRoleApi(name, payload, { errorMessage: t('Errors.UpdateRole') }),
        onSuccess: () => {
            toast.success(t('Toasts.RoleUpdated'));
            queryClient.invalidateQueries({ queryKey: rolesQueryKey });
            setRoleModalOpen(false);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.RoleUpdateFailed'));
        },
    });

    const deleteRoleMutation = useMutation({
        mutationFn: (name: string) => deleteClickHouseRoleApi(name, { errorMessage: t('Errors.DeleteRole') }),
        onSuccess: () => {
            toast.success(t('Toasts.RoleDeleted'));
            queryClient.invalidateQueries({ queryKey: rolesQueryKey });
            setPendingDeleteRole(null);
        },
        onError: (error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Toasts.RoleDeleteFailed'));
        },
    });

    const openCreateUser = () => {
        setUserModalMode('create');
        setEditingUser(null);
        setUserModalOpen(true);
    };

    const openEditUser = (user: ClickHouseUser) => {
        setUserModalMode('edit');
        setEditingUser(user);
        setUserModalOpen(true);
    };

    const openCreateRole = () => {
        setRoleModalMode('create');
        setEditingRole(null);
        setRoleModalOpen(true);
    };

    const openEditRole = (role: ClickHouseRole) => {
        setRoleModalMode('edit');
        setEditingRole(role);
        setRoleModalOpen(true);
    };

    const onSubmitUserForm = async (values: UserFormValues, meta: { passwordChanged: boolean }) => {
        const baseRoles = Array.from(new Set(values.roles.map(role => role.trim()).filter(Boolean)));
        const defaultRoles = values.defaultRole ? [values.defaultRole] : [];
        const roles = values.defaultRole ? Array.from(new Set([...baseRoles, values.defaultRole])) : baseRoles;
        const allowedHosts = parseList(values.allowedHosts);
        const allowAllHosts = allowedHosts.length === 0;
        const cluster = values.onCluster && values.cluster ? values.cluster : undefined;

        const passwordValue = values.password.trim();
        const passwordForCreate = passwordValue || undefined;
        const passwordForUpdate = meta.passwordChanged ? (passwordValue ? passwordValue : null) : undefined;

        if (userModalMode === 'create') {
            await createUserMutation.mutateAsync({
                name: values.name.trim(),
                password: passwordForCreate,
                allowAllHosts,
                allowedClientHosts: allowAllHosts ? [] : allowedHosts,
                roles,
                defaultRoles,
                cluster,
            });
            return;
        }

        if (!editingUser) return;

        await updateUserMutation.mutateAsync({
            name: editingUser.name,
            payload: {
                name: editingUser.name,
                newName: values.name.trim() !== editingUser.name ? values.name.trim() : undefined,
                password: passwordForUpdate,
                allowAllHosts,
                allowedClientHosts: allowAllHosts ? [] : allowedHosts,
                roles,
                defaultRoles,
                cluster,
            },
        });
    };

    const onSubmitRoleForm = async (values: RoleFormValues) => {
        const privileges: RolePrivilege[] = values.privileges
            .map(priv => ({
                privilege: priv.privilege.trim().toUpperCase(),
                database: priv.database.trim() || '*',
                table: priv.table.trim() || '*',
                columns: parseList(priv.columns),
                grantOption: priv.grantOption,
            }))
            .filter(priv => priv.privilege.length > 0);
        const cluster = values.onCluster && values.cluster ? values.cluster : undefined;

        if (roleModalMode === 'create') {
            await createRoleMutation.mutateAsync({
                name: values.name.trim(),
                privileges,
                cluster,
            });
            return;
        }

        if (!editingRole) return;

        await updateRoleMutation.mutateAsync({
            name: editingRole.name,
            payload: {
                name: editingRole.name,
                newName: values.name.trim() !== editingRole.name ? values.name.trim() : undefined,
                privileges,
                cluster,
            },
        });
    };

    const isLoading = usersQuery.isLoading || rolesQuery.isLoading;

    return (
        <div className="flex h-full flex-col gap-6 p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">{t('Title')}</h1>
                    <p className="text-muted-foreground text-sm">
                        {t('Description')}
                    </p>
                </div>
            </header>

            {!connectionId ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        {t('Empty.NoConnection')}
                    </CardContent>
                </Card>
            ) : (
                <Tabs defaultValue={DEFAULT_TAB} className="flex-1 flex flex-col">
                    <TabsList className="w-fit">
                        <TabsTrigger value="users" className="flex items-center gap-2">
                            <UsersIcon className="size-4" />
                            {t('Tabs.Users')}
                        </TabsTrigger>
                        <TabsTrigger value="roles" className="flex items-center gap-2">
                            <ShieldCheck className="size-4" />
                            {t('Tabs.Roles')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="users" className="flex-1">
                        <UsersSection
                            isBusy={isLoading}
                            isLoading={usersQuery.isLoading}
                            users={usersQuery.data}
                            onCreate={openCreateUser}
                            onEdit={openEditUser}
                            onDelete={user => setPendingDeleteUser(user)}
                        />
                    </TabsContent>

                    <TabsContent value="roles" className="flex-1">
                        <RolesSection
                            isBusy={isLoading}
                            isLoading={rolesQuery.isLoading}
                            roles={rolesQuery.data}
                            onCreate={openCreateRole}
                            onEdit={openEditRole}
                            onDelete={role => setPendingDeleteRole(role)}
                        />
                    </TabsContent>
                </Tabs>
            )}

            <UserDialog
                open={userModalOpen}
                mode={userModalMode}
                onClose={() => setUserModalOpen(false)}
                isSubmitting={createUserMutation.isPending || updateUserMutation.isPending}
                onSubmit={onSubmitUserForm}
                initialUser={editingUser}
                availableRoles={availableRoleNames}
                availableClusters={clusterOptions}
                isClustersLoading={isClustersLoading}
            />

            <RoleDialog
                open={roleModalOpen}
                mode={roleModalMode}
                onClose={() => setRoleModalOpen(false)}
                isSubmitting={createRoleMutation.isPending || updateRoleMutation.isPending}
                onSubmit={onSubmitRoleForm}
                initialRole={editingRole}
                availableClusters={clusterOptions}
                isClustersLoading={isClustersLoading}
            />

            <AlertDialog open={Boolean(pendingDeleteUser)} onOpenChange={open => !open && setPendingDeleteUser(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('Dialogs.DeleteUser.Title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('Dialogs.DeleteUser.Description', { name: pendingDeleteUser?.name as string })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteUserMutation.isPending}>{t('Actions.Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => pendingDeleteUser && deleteUserMutation.mutate(pendingDeleteUser.name)}
                            disabled={deleteUserMutation.isPending}
                        >
                            {deleteUserMutation.isPending ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : null}
                            {t('Actions.ConfirmDelete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={Boolean(pendingDeleteRole)} onOpenChange={open => !open && setPendingDeleteRole(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('Dialogs.DeleteRole.Title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('Dialogs.DeleteRole.Description', { name: pendingDeleteRole?.name as string })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteRoleMutation.isPending}>{t('Actions.Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => pendingDeleteRole && deleteRoleMutation.mutate(pendingDeleteRole.name)}
                            disabled={deleteRoleMutation.isPending}
                        >
                            {deleteRoleMutation.isPending ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : null}
                            {t('Actions.ConfirmDelete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
