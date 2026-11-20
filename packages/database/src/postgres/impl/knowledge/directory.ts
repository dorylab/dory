import type { PostgresDBClient } from '@dory/shared';
import { and, eq, isNull } from 'drizzle-orm';

import { knowledgeConnectorItems, knowledgeConnectors, knowledgeFolders, knowledgeModels, knowledgeSources } from '../../schemas/knowledge';

type Scope = { organizationId: string; knowledgeModelId: string };
type Tx = Pick<PostgresDBClient, 'select' | 'insert' | 'update' | 'delete'>;
type Change =
    | { operation: 'create'; parentId: string | null; name: string }
    | { operation: 'rename'; kind: 'folder' | 'document'; id: string; name: string }
    | { operation: 'move'; kind: 'folder' | 'document'; id: string; parentId: string | null }
    | { operation: 'delete'; kind: 'folder'; id: string };

function scopedModel(scope: Scope) {
    return and(eq(knowledgeModels.id, scope.knowledgeModelId), eq(knowledgeModels.organizationId, scope.organizationId));
}

export async function lockDirectory(tx: Tx, scope: Scope) {
    const [model] = await tx.select({ id: knowledgeModels.id }).from(knowledgeModels).where(scopedModel(scope)).for('update');
    if (!model) throw new Error('Knowledge base not found.');
}

export async function assertDestination(tx: Tx, modelId: string, parentId: string | null, name: string, excludeId?: string) {
    if (parentId !== null) {
        const [folder] = await tx
            .select({ id: knowledgeFolders.id })
            .from(knowledgeFolders)
            .where(and(eq(knowledgeFolders.id, parentId), eq(knowledgeFolders.knowledgeModelId, modelId)));
        if (!folder) throw new Error('Choose a local folder in this knowledge base.');
    }
    const [folder] = await tx
        .select({ id: knowledgeFolders.id })
        .from(knowledgeFolders)
        .where(
            and(
                eq(knowledgeFolders.knowledgeModelId, modelId),
                parentId === null ? isNull(knowledgeFolders.parentId) : eq(knowledgeFolders.parentId, parentId),
                eq(knowledgeFolders.name, name),
            ),
        );
    const [source] = await tx
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(
            and(
                eq(knowledgeSources.knowledgeModelId, modelId),
                parentId === null ? isNull(knowledgeSources.folderId) : eq(knowledgeSources.folderId, parentId),
                eq(knowledgeSources.fileName, name),
            ),
        );
    if ((folder && folder.id !== excludeId) || (source && source.id !== excludeId)) throw new Error(`“${name}” already exists in this folder. Choose another name.`);
}

export async function localDocument(tx: Tx, modelId: string, id: string) {
    const [source] = await tx
        .select({
            id: knowledgeSources.id,
            fileName: knowledgeSources.fileName,
            folderId: knowledgeSources.folderId,
            format: knowledgeSources.format,
            connectorId: knowledgeConnectorItems.connectorId,
        })
        .from(knowledgeSources)
        .leftJoin(knowledgeConnectorItems, eq(knowledgeSources.id, knowledgeConnectorItems.knowledgeSourceId))
        .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.knowledgeModelId, modelId)));
    if (!source) throw new Error('Knowledge source not found.');
    if (source.connectorId) throw new Error('Connector-managed knowledge sources are read-only.');
    return source;
}

export class KnowledgeDirectory {
    constructor(private db: PostgresDBClient) {}

    async list(scope: Scope) {
        const [model] = await this.db.select({ id: knowledgeModels.id }).from(knowledgeModels).where(scopedModel(scope));
        if (!model) throw new Error('Knowledge base not found.');
        const [folders, connectors] = await Promise.all([
            this.db
                .select({ id: knowledgeFolders.id, name: knowledgeFolders.name, parentId: knowledgeFolders.parentId })
                .from(knowledgeFolders)
                .where(eq(knowledgeFolders.knowledgeModelId, model.id)),
            this.db
                .select({
                    id: knowledgeConnectors.id,
                    provider: knowledgeConnectors.provider,
                    displayName: knowledgeConnectors.displayName,
                    syncedFolders: knowledgeConnectors.syncedFolders,
                    repositoryFullName: knowledgeConnectors.repositoryFullName,
                    rootPath: knowledgeConnectors.rootPath,
                    linearWorkspaceName: knowledgeConnectors.linearWorkspaceName,
                })
                .from(knowledgeConnectors)
                .where(eq(knowledgeConnectors.knowledgeModelId, model.id)),
        ]);
        return { folders, connectors };
    }

    async change(scope: Scope, change: Change, canWrite: boolean) {
        if (!canWrite) throw new Error('Workspace write permission is required.');
        return this.db.transaction(async tx => {
            await lockDirectory(tx, scope);
            const modelId = scope.knowledgeModelId;
            const name = 'name' in change ? change.name.trim() : '';
            if ('name' in change && (!name || name.length > 240 || /[/\\\0]/.test(name) || name === '.' || name === '..')) throw new Error('Enter a valid name.');
            let id: string;
            if (change.operation === 'create') {
                await assertDestination(tx, modelId, change.parentId, name);
                const [folder] = await tx.insert(knowledgeFolders).values({ knowledgeModelId: modelId, name, parentId: change.parentId }).returning({ id: knowledgeFolders.id });
                id = folder.id;
            } else if (change.kind === 'document') {
                const source = await localDocument(tx, modelId, change.id);
                if (source.format !== 'markdown') throw new Error('Only Markdown documents can be organized here.');
                const fileName = change.operation === 'rename' ? name : source.fileName;
                if (!/\.(md|markdown)$/i.test(fileName)) throw new Error('Use a Markdown file extension (.md or .markdown).');
                const folderId = change.operation === 'move' ? change.parentId : source.folderId;
                await assertDestination(tx, modelId, folderId, fileName, source.id);
                await tx.update(knowledgeSources).set({ fileName, folderId }).where(eq(knowledgeSources.id, source.id));
                id = source.id;
            } else {
                const folders = await tx.select().from(knowledgeFolders).where(eq(knowledgeFolders.knowledgeModelId, modelId));
                const byId = new Map(folders.map(folder => [folder.id, folder]));
                const folder = byId.get(change.id);
                if (!folder) throw new Error('Local folder not found.');
                id = folder.id;
                if (change.operation === 'delete') {
                    const [file] = await tx.select({ id: knowledgeSources.id }).from(knowledgeSources).where(eq(knowledgeSources.folderId, id)).limit(1);
                    if (file || folders.some(child => child.parentId === id)) throw new Error('Move the contents out before deleting this folder.');
                    await tx.delete(knowledgeFolders).where(eq(knowledgeFolders.id, id));
                } else {
                    const parentId = change.operation === 'move' ? change.parentId : folder.parentId;
                    for (let ancestor = parentId; ancestor; ancestor = byId.get(ancestor)?.parentId ?? null) {
                        if (ancestor === id) throw new Error('A folder cannot move into itself or its descendants.');
                    }
                    const nextName = change.operation === 'rename' ? name : folder.name;
                    await assertDestination(tx, modelId, parentId, nextName, id);
                    await tx.update(knowledgeFolders).set({ parentId, name: nextName }).where(eq(knowledgeFolders.id, id));
                }
            }
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, modelId));
            return { id };
        });
    }
}
