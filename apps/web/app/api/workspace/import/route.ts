import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { withUserAndOrganizationHandler } from '../../utils/with-organization-handler';
import { handleApiError } from '../../utils/handle-error';
import { parseJsonBody } from '../../utils/parse-json';

const identitySchema = z.object({
    name: z.string().min(1),
    username: z.string().min(1),
    role: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
    database: z.string().nullable().optional(),
});

const sshSchema = z.object({
    enabled: z.boolean(),
    host: z.string().nullable().optional(),
    port: z.number().nullable().optional(),
    username: z.string().nullable().optional(),
    authMethod: z.string().nullable().optional(),
});

const connectionSchema = z.object({
    connection: z.object({
        type: z.string().min(1),
        engine: z.string().min(1),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        httpPort: z.number().int().min(1).max(65535).nullable().optional(),
        database: z.string().nullable().optional(),
        options: z.string().optional(),
        environment: z.string().optional(),
        tags: z.string().optional(),
    }),
    identities: z.array(identitySchema).optional(),
    ssh: sshSchema.nullable().optional(),
});

const folderSchema = z.object({
    _exportId: z.string(),
    name: z.string().min(1),
    position: z.number().int().optional(),
});

const querySchema = z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    sqlText: z.string().min(1),
    connectionName: z.string().nullable().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    folderExportId: z.string().nullable().optional(),
    position: z.number().int().optional(),
});

const importSchema = z.object({
    version: z.number().int().min(1).max(1),
    exportedAt: z.string().optional(),
    connections: z.array(connectionSchema).optional(),
    savedQueryFolders: z.array(folderSchema).optional(),
    savedQueries: z.array(querySchema).optional(),
});

function formatTimeSuffix(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function resolveUniqueConnectionName(
    existingNames: Set<string>,
    desiredName: string,
): Promise<string> {
    if (!existingNames.has(desiredName)) return desiredName;
    const suffix = `(import ${formatTimeSuffix()})`;
    let candidate = `${desiredName} ${suffix}`;
    let counter = 2;
    while (existingNames.has(candidate)) {
        candidate = `${desiredName} ${suffix} ${counter}`;
        counter++;
    }
    return candidate;
}

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    try {
        const payload = await parseJsonBody(req, importSchema);

        const result = {
            connections: { created: 0, skipped: 0 },
            savedQueryFolders: { created: 0 },
            savedQueries: { created: 0, skipped: 0 },
        };

        // 1. Get existing connection names
        const existingConnections = await db.connections.list(organizationId);
        const existingNames = new Set(existingConnections.map(c => c.connection.name));

        // Map: original export name -> new connectionId
        const connectionNameToIdMap = new Map<string, string>();

        // Also include existing connections in the map
        for (const c of existingConnections) {
            connectionNameToIdMap.set(c.connection.name, c.connection.id);
        }

        // 2. Import connections
        if (payload.connections) {
            for (const item of payload.connections) {
                const resolvedName = await resolveUniqueConnectionName(existingNames, item.connection.name);
                existingNames.add(resolvedName);

                const created = await db.connections.create(userId, organizationId, {
                    connection: {
                        ...item.connection,
                        name: resolvedName,
                        organizationId,
                    } as any,
                    identities: (item.identities ?? []) as any,
                    ssh: item.ssh as any,
                });

                connectionNameToIdMap.set(item.connection.name, created.connection.id);
                result.connections.created++;
            }
        }

        // 3. Import folders
        const folderExportIdToNewIdMap = new Map<string, string>();

        if (payload.savedQueryFolders) {
            for (const folder of payload.savedQueryFolders) {
                const created = await db.savedQueryFolders.create({
                    organizationId,
                    userId,
                    name: folder.name,
                });
                folderExportIdToNewIdMap.set(folder._exportId, created.id);
                result.savedQueryFolders.created++;
            }
        }

        // 4. Import saved queries
        if (payload.savedQueries) {
            for (const query of payload.savedQueries) {
                // Resolve connectionId from connectionName
                const connectionId = query.connectionName
                    ? connectionNameToIdMap.get(query.connectionName)
                    : null;

                if (!connectionId) {
                    result.savedQueries.skipped++;
                    continue;
                }

                // Resolve folderId
                const folderId = query.folderExportId
                    ? (folderExportIdToNewIdMap.get(query.folderExportId) ?? null)
                    : null;

                const created = await db.savedQueries.create({
                    organizationId,
                    userId,
                    title: query.title,
                    description: query.description,
                    sqlText: query.sqlText,
                    context: query.context as Record<string, unknown>,
                    tags: query.tags,
                    connectionId,
                });

                // Update folderId and position if needed
                if (folderId || query.position) {
                    await db.savedQueries.update({
                        organizationId,
                        userId,
                        id: created.id,
                        connectionId,
                        patch: {
                            ...(folderId ? { folderId } : {}),
                            ...(query.position ? { position: query.position } : {}),
                        },
                    });
                }

                result.savedQueries.created++;
            }
        }

        return NextResponse.json(ResponseUtil.success(result));
    } catch (err: any) {
        if (err instanceof z.ZodError) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: 'Invalid import data format',
                    error: err,
                }),
                { status: 400 },
            );
        }
        return handleApiError(err);
    }
});
