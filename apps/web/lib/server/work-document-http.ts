import type { NextRequest } from 'next/server';
import { getDBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { z } from 'zod';

import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { canReadWorkspace, resolveOrganizationAccess } from '@/lib/server/authz';
import { parseWorkRevision } from '@/lib/work-documents/revision';
import { workDraftSchema } from '@/lib/work-documents/schema';

import { assertDocumentWrite, createWorkFromRun, saveWorkDraft } from './work-documents';

export async function documentHttp(req: NextRequest, documentId?: string) {
    try {
        const session = await getSessionFromRequest(req);
        const userId = session?.user?.id;
        const organizationId = resolveCurrentOrganizationId(session);
        if (!userId || !organizationId) throw new DatabaseError('Unauthorized.', 401);
        const owner = { userId, organizationId };
        if (!canReadWorkspace(await resolveOrganizationAccess(organizationId, userId))) throw new DatabaseError('Forbidden.', 403);
        const db = await getDBService();
        const search = new URL(req.url).searchParams;
        if (req.method === 'GET') {
            if (documentId) {
                const target = { ...owner, documentId };
                const revision = parseWorkRevision(search.get('revision'));
                const [document, versions] = await Promise.all([
                    revision === undefined ? db.workDocuments.get(target) : db.workDocuments.getVersion({ ...target, revision }),
                    db.workDocuments.versions(target),
                ]);
                workDraftSchema.parse({ title: document.title, markdown: document.content.markdown, visuals: document.content.visuals, status: document.status });
                return Response.json({ document, versions });
            }
            return Response.json({
                documents: await db.workDocuments.list({
                    ...owner,
                    query: search.get('q') ?? undefined,
                    connectionId: search.get('connectionId') ?? undefined,
                    chatId: search.get('chatId') ?? undefined,
                    archived: search.get('archived') === 'true',
                }),
            });
        }
        await assertDocumentWrite(owner);
        if (!documentId && req.method === 'POST') {
            const input = z.object({ runId: z.string().min(1) }).parse(await req.json());
            return Response.json({ document: await createWorkFromRun(db, { ...owner, ...input }) });
        }
        if (!documentId) throw new DatabaseError('Missing document ID.', 400);
        const input = z
            .discriminatedUnion('action', [
                z.object({ action: z.literal('save'), expectedRevision: z.number().int().positive(), draft: workDraftSchema }),
                z.object({ action: z.literal('restore'), expectedRevision: z.number().int().positive(), revision: z.number().int().positive() }),
                z.object({ action: z.literal('archive'), archived: z.boolean() }),
                z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(160), expectedRevision: z.number().int().positive() }),
            ])
            .parse(await req.json());
        const target = { ...owner, documentId };
        const document =
            input.action === 'save'
                ? await saveWorkDraft(db, { ...target, ...input, source: 'user' })
                : input.action === 'restore'
                  ? await db.workDocuments.restore({ ...target, ...input })
                  : input.action === 'rename'
                    ? await db.workDocuments.rename({ ...target, ...input })
                    : await db.workDocuments.archive({ ...target, archived: input.archived });
        return Response.json({ document });
    } catch (error) {
        return Response.json(
            { error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join('; ') : error instanceof Error ? error.message : 'Request failed.' },
            { status: error instanceof z.ZodError ? 400 : error instanceof DatabaseError ? error.code : 500 },
        );
    }
}

export async function dataAgentHttp(req: NextRequest) {
    try {
        const session = await getSessionFromRequest(req);
        const userId = session?.user?.id;
        const organizationId = resolveCurrentOrganizationId(session);
        if (!userId || !organizationId) throw new DatabaseError('Unauthorized.', 401);
        const access = await resolveOrganizationAccess(organizationId, userId);
        if (!canReadWorkspace(access) || !access?.permissions.connection.read) throw new DatabaseError('Forbidden.', 403);
        const db = await getDBService();
        const [connections, models, sessions] = await Promise.all([
            db.connections.list(organizationId),
            db.knowledge.listModels({ organizationId }),
            db.chat.listSessions({ organizationId, userId, type: 'global', includeArchived: false }),
        ]);
        return Response.json({
            connections: connections.map(item => ({ id: item.connection.id, name: item.connection.name, type: item.connection.type, defaultDatabase: item.connection.database })),
            models: models.map(model => ({ id: model.id, name: model.name, connectionIds: model.dataSources.map(source => source.connectionId) })),
            sessions: sessions.map(item => ({
                id: item.id,
                title: item.title,
                type: item.type,
                connectionId: item.connectionId,
                activeDatabase: item.activeDatabase,
                scope: item.metadata?.analysisScope ?? null,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                lastMessageAt: item.lastMessageAt,
            })),
        });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Request failed.' }, { status: error instanceof DatabaseError ? error.code : 500 });
    }
}
