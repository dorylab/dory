import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { beginDriveAuthorization, driveAccess, getDriveFolder, listDriveFolders } from '@/lib/server/google-drive';
import { getKnowledgeConnectorSyncRunner } from '@/lib/server/knowledge-connector-sync';

const model = z.object({ knowledgeModelId: z.string().min(1) });
const session = model.extend({ id: z.string().min(1) });
const folder = session.extend({ folderId: z.string().regex(/^[A-Za-z0-9_-]+$/) });
const folderInfo = z.object({ id: z.string(), name: z.string() });
const common = {
    domain: 'knowledge' as const,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'] as ['user'],
    audit: { allowInputFields: ['knowledgeModelId'] },
};
const command = { ...common, kind: 'command', risk: 'write', requiresConfirmation: false } as const;
const query = { ...common, kind: 'query', risk: 'read' } as const;

export const folderConnectorActions = [
    defineWebAction({
        ...command,
        id: 'knowledge.syncLocalFolder',
        inputSchema: model.extend({
            connectorId: z.string().optional(),
            revision: z.number().int().nonnegative().optional(),
            name: z.string().min(1).max(255),
            directories: z
                .array(
                    z
                        .string()
                        .min(1)
                        .max(4000)
                        .refine(path => path.split('/').every(part => part && part !== '.' && part !== '..')),
                )
                .max(10000)
                .optional(),
            files: z
                .array(
                    z.object({
                        path: z
                            .string()
                            .min(1)
                            .max(4000)
                            .refine(path => /\.(md|markdown)$/i.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..') && !path.includes('\0')),
                        contentText: z.string().max(10_000_000),
                    }),
                )
                .max(5000),
        }),
        outputSchema: z.object({ id: z.string() }),
        handler: async (ctx, input) => {
            const db = ctx.services.db.knowledge;
            await db.getModel({ organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId });
            const connector = input.connectorId ? await db.getConnector({ organizationId: ctx.organizationId, connectorId: input.connectorId }) : null;
            if (
                connector &&
                (connector.provider !== 'local' || connector.knowledgeModelId !== input.knowledgeModelId || connector.displayName !== input.name || input.revision === undefined)
            )
                throw new Error('Select the original folder for this connection.');
            const id = connector?.id ?? 'kc_' + randomUUID();
            let bytes = 0;
            const files = input.files.map(file => {
                bytes += Buffer.byteLength(file.contentText);
                if (bytes > 50_000_000) throw new Error('Folder exceeds the 50 MB sync limit.');
                return { ...file, format: 'markdown' as const, title: file.path.split('/').pop()!, sha: createHash('sha256').update(file.contentText).digest('hex') };
            });
            await db.applyConnectorSnapshot({
                connectorId: id,
                files,
                folders: input.directories?.map(path => {
                    const last = path.lastIndexOf('/');
                    return { id: path, parent: last === -1 ? '' : path.slice(0, last), name: path.slice(last + 1) };
                }),
                configRevision: input.revision,
                newLocal: connector ? undefined : { organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId, displayName: input.name, createdBy: ctx.userId },
            });
            return { id };
        },
    }),
    defineWebAction({
        ...command,
        id: 'knowledge.beginDriveAuthorization',
        inputSchema: model,
        outputSchema: z.object({ id: z.string(), url: z.string() }),
        handler: (ctx, input) => beginDriveAuthorization(ctx.services.db, { ...input, organizationId: ctx.organizationId, userId: ctx.userId }),
    }),
    defineWebAction({
        ...query,
        id: 'knowledge.driveAuthorizationStatus',
        inputSchema: session,
        outputSchema: z.object({ status: z.enum(['pending', 'ready', 'cancelled']) }),
        handler: async (ctx, input) => {
            const row = await ctx.services.db.knowledge.getDriveAuthorization({ ...input, organizationId: ctx.organizationId, userId: ctx.userId });
            return { status: row.refreshTokenEncrypted ? 'ready' : row.verifier === '' ? 'cancelled' : 'pending' };
        },
    }),
    defineWebAction({
        ...query,
        id: 'knowledge.listDriveFolders',
        inputSchema: folder,
        outputSchema: z.object({ folders: z.array(folderInfo) }),
        handler: async (ctx, input) => {
            const row = await ctx.services.db.knowledge.getDriveAuthorization({ ...input, organizationId: ctx.organizationId, userId: ctx.userId });
            if (!row.refreshTokenEncrypted) throw new Error('Authorize Google Drive first.');
            return { folders: await listDriveFolders(await driveAccess(row.refreshTokenEncrypted), input.folderId) };
        },
    }),
    defineWebAction({
        ...command,
        id: 'knowledge.connectDriveFolder',
        inputSchema: folder.extend({ connectorId: z.string().optional() }),
        outputSchema: z.object({ id: z.string() }),
        handler: async (ctx, input) => {
            const owner = { ...input, organizationId: ctx.organizationId, userId: ctx.userId };
            const row = await ctx.services.db.knowledge.getDriveAuthorization(owner);
            if (!row.refreshTokenEncrypted) throw new Error('Authorize Google Drive first.');
            const chosen = await getDriveFolder(await driveAccess(row.refreshTokenEncrypted), input.folderId);
            const result = await ctx.services.db.knowledge.connectDriveFolder({ ...owner, folderId: chosen.id, name: chosen.name });
            getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
            return result;
        },
    }),
];
