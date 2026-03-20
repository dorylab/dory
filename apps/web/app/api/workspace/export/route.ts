import { NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { withUserAndOrganizationHandler } from '../../utils/with-organization-handler';
import { handleApiError } from '../../utils/handle-error';

export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, userId }) => {
    try {
        // Fetch connections (organization-level)
        const connectionList = await db.connections.list(organizationId);

        // Fetch saved query folders (user-level)
        const folders = await db.savedQueryFolders.list({ organizationId, userId });

        // Fetch all saved queries across all connections (user-level)
        const queries = await db.savedQueries.listAll({ organizationId, userId });

        // Build connection name map: connectionId -> connectionName
        const connectionNameMap = new Map<string, string>();
        for (const item of connectionList) {
            connectionNameMap.set(item.connection.id, item.connection.name);
        }

        // Build folder export ID map: folderId -> exportIndex
        const folderExportIdMap = new Map<string, string>();
        folders.forEach((f, i) => {
            folderExportIdMap.set(f.id, `folder_${i}`);
        });

        // Export connections (exclude sensitive data)
        const exportedConnections = connectionList.map(item => ({
            connection: {
                type: item.connection.type,
                engine: item.connection.engine,
                name: item.connection.name,
                description: item.connection.description ?? null,
                host: item.connection.host,
                port: item.connection.port,
                httpPort: item.connection.httpPort ?? null,
                database: item.connection.database ?? null,
                options: item.connection.options,
                environment: item.connection.environment,
                tags: item.connection.tags,
            },
            identities: item.identities.map(id => ({
                name: id.name,
                username: id.username,
                role: id.role,
                isDefault: id.isDefault,
                database: id.database,
            })),
            ssh: item.ssh
                ? {
                      enabled: item.ssh.enabled,
                      host: item.ssh.host,
                      port: item.ssh.port,
                      username: item.ssh.username,
                      authMethod: item.ssh.authMethod,
                  }
                : null,
        }));

        // Export folders
        const exportedFolders = folders.map(f => ({
            _exportId: folderExportIdMap.get(f.id)!,
            name: f.name,
            position: f.position,
        }));

        // Export queries
        const exportedQueries = queries.map(q => ({
            title: q.title,
            description: q.description ?? null,
            sqlText: q.sqlText,
            connectionName: connectionNameMap.get(q.connectionId) ?? null,
            context: q.context ?? {},
            tags: q.tags ?? [],
            folderExportId: q.folderId ? (folderExportIdMap.get(q.folderId) ?? null) : null,
            position: q.position,
        }));

        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            connections: exportedConnections,
            savedQueryFolders: exportedFolders,
            savedQueries: exportedQueries,
        };

        return NextResponse.json(ResponseUtil.success(exportData));
    } catch (err: any) {
        return handleApiError(err);
    }
});
