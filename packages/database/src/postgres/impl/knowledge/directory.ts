import type { PostgresDBClient } from '@dory/shared';
import { and, asc, eq, isNull, isNotNull, or, sql } from 'drizzle-orm';

import { knowledgeConnectorItems, knowledgeConnectors, knowledgeFolders, knowledgeModels, knowledgeSources, knowledgeVerifiedQueries } from '../../schemas/knowledge';

import { buildDocumentDirectory, QUERY_FOLDER, ROOT, type NavigationHit } from '@dory/shared/utils/knowledge-directory';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';

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
            systemRole: knowledgeSources.systemRole,
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

    models(organizationId: string) {
        return this.db
            .select({ id: knowledgeModels.id, name: knowledgeModels.name, hasGuide: sql<boolean>`length(trim(${knowledgeModels.businessContextMd})) > 0` })
            .from(knowledgeModels)
            .where(eq(knowledgeModels.organizationId, organizationId))
            .orderBy(asc(knowledgeModels.name), asc(knowledgeModels.id));
    }

    queryEntries(scope: Scope) {
        return this.db
            .select({ id: knowledgeVerifiedQueries.id, title: knowledgeVerifiedQueries.title, question: knowledgeVerifiedQueries.question })
            .from(knowledgeVerifiedQueries)
            .innerJoin(knowledgeModels, eq(knowledgeModels.id, knowledgeVerifiedQueries.knowledgeModelId))
            .where(scopedModel(scope))
            .orderBy(asc(knowledgeVerifiedQueries.title), asc(knowledgeVerifiedQueries.id));
    }

    async search(organizationId: string, input: { query: string; offset: number; limit: number; includeRules: boolean; queryFolderName: string; guideName: string }) {
        const owned = eq(knowledgeModels.organizationId, organizationId);
        const term = input.query.trim().toLocaleLowerCase();
        const [models, folders, connectors, files, queries] = await Promise.all([
            this.db
                .select({ id: knowledgeModels.id, name: knowledgeModels.name, hasGuide: sql<boolean>`length(trim(${knowledgeModels.businessContextMd})) > 0` })
                .from(knowledgeModels)
                .where(owned),
            this.db
                .select({ knowledgeModelId: knowledgeFolders.knowledgeModelId, id: knowledgeFolders.id, name: knowledgeFolders.name, parentId: knowledgeFolders.parentId })
                .from(knowledgeFolders)
                .innerJoin(knowledgeModels, eq(knowledgeFolders.knowledgeModelId, knowledgeModels.id))
                .where(owned),
            this.db
                .select({
                    knowledgeModelId: knowledgeConnectors.knowledgeModelId,
                    id: knowledgeConnectors.id,
                    provider: knowledgeConnectors.provider,
                    displayName: knowledgeConnectors.displayName,
                    syncedFolders: knowledgeConnectors.syncedFolders,
                    repositoryFullName: knowledgeConnectors.repositoryFullName,
                    linearWorkspaceName: knowledgeConnectors.linearWorkspaceName,
                    rootPath: knowledgeConnectors.rootPath,
                })
                .from(knowledgeConnectors)
                .innerJoin(knowledgeModels, eq(knowledgeConnectors.knowledgeModelId, knowledgeModels.id))
                .where(owned),
            this.db
                .select({
                    knowledgeModelId: knowledgeSources.knowledgeModelId,
                    id: knowledgeSources.id,
                    format: knowledgeSources.format,
                    folderId: knowledgeSources.folderId,
                    fileName: knowledgeSources.fileName,
                    systemRole: knowledgeSources.systemRole,
                    connectorId: knowledgeConnectorItems.connectorId,
                    remoteTitle: knowledgeConnectorItems.remoteTitle,
                    remotePath: knowledgeConnectorItems.remotePath,
                    folderTrail: knowledgeConnectorItems.folderTrail,
                    projectId: knowledgeConnectorItems.projectId,
                    projectName: knowledgeConnectorItems.projectName,
                })
                .from(knowledgeSources)
                .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
                .where(
                    and(
                        eq(knowledgeSources.organizationId, organizationId),
                        or(
                            isNotNull(knowledgeConnectorItems.connectorId),
                            sql`strpos(lower(${knowledgeSources.fileName}), ${term}) > 0`,
                            input.includeRules ? eq(knowledgeSources.systemRole, 'analysis_rules') : undefined,
                        ),
                    ),
                ),
            this.db
                .select({
                    knowledgeModelId: knowledgeVerifiedQueries.knowledgeModelId,
                    id: knowledgeVerifiedQueries.id,
                    title: knowledgeVerifiedQueries.title,
                    question: knowledgeVerifiedQueries.question,
                })
                .from(knowledgeVerifiedQueries)
                .innerJoin(knowledgeModels, eq(knowledgeVerifiedQueries.knowledgeModelId, knowledgeModels.id))
                .where(and(owned, or(sql`strpos(lower(${knowledgeVerifiedQueries.title}), ${term}) > 0`, sql`strpos(lower(${knowledgeVerifiedQueries.question}), ${term}) > 0`))),
        ]);
        const hits: NavigationHit[] = [];
        const matches = (name: string) => name.toLocaleLowerCase().includes(term);
        function group<T extends { knowledgeModelId: string }>(rows: T[]) {
            const map = new Map<string, T[]>();
            for (const row of rows) {
                const group = map.get(row.knowledgeModelId);
                if (group) group.push(row);
                else map.set(row.knowledgeModelId, [row]);
            }
            return map;
        }
        const byFolder = group(folders),
            byConnector = group(connectors),
            byFile = group(files),
            byQuery = group(queries);
        for (const { id: modelId, name, hasGuide } of models) {
            if (matches(name)) hits.push({ modelId, kind: 'model', id: modelId, name, path: [name] });
            if (matches(input.queryFolderName)) hits.push({ modelId, kind: 'folder', id: QUERY_FOLDER, name: input.queryFolderName, path: [name, input.queryFolderName] });
            const directory = buildDocumentDirectory(
                hasGuide ? input.guideName : null,
                { folders: byFolder.get(modelId) ?? [], connectors: byConnector.get(modelId) ?? [] },
                (byFile.get(modelId) ?? []).map(file => ({ ...file, fileName: knowledgeSourceDisplayName(file) })),
                name,
            );
            const path = (id: string) => [
                name,
                ...directory
                    .trail(id)
                    .filter(folder => folder.id !== ROOT)
                    .map(folder => folder.name),
            ];
            for (const folder of directory.folders.values()) {
                if (folder.id !== ROOT && matches(folder.name)) hits.push({ modelId, kind: 'folder', id: folder.id, name: folder.name, path: path(folder.id) });
            }
            for (const file of byFile.get(modelId) ?? []) {
                if (file.format === 'markdown') continue;
                const displayName = knowledgeSourceDisplayName(file);
                if (matches(displayName)) hits.push({ modelId, kind: 'source', id: file.id, name: displayName, path: [name, displayName] });
            }
            for (const file of directory.documents) {
                if (matches(file.name) || (input.includeRules && file.source?.systemRole === 'analysis_rules'))
                    hits.push({ modelId, kind: 'document', id: file.id, name: file.name, path: [...path(file.parentId), file.name] });
            }
            for (const query of byQuery.get(modelId) ?? []) {
                hits.push({ modelId, kind: 'query', id: query.id, name: query.title, path: [name, input.queryFolderName, query.title] });
            }
        }
        hits.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')) || a.id.localeCompare(b.id));
        return { items: hits.slice(input.offset, input.offset + input.limit), total: hits.length };
    }

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
                if (source.systemRole) throw new Error('Analysis rules cannot be moved or renamed.');
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
