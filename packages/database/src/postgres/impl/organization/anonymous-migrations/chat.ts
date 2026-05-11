import { and, eq } from 'drizzle-orm';
import { schema } from '@dory/database/schema';
import type { AnonymousOwnershipMigration } from './types';

const tables = ['chatSessions', 'chatMessages', 'chatSessionState'];

export const chatAnonymousOwnershipMigration: AnonymousOwnershipMigration = {
    id: 'chat',
    tables,
    async migrate(tx, params) {
        const movedSessions = await tx
            .update(schema.chatSessions)
            .set({
                organizationId: params.targetOrganizationId,
                userId: params.newUserId,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(schema.chatSessions.organizationId, params.sourceOrganizationId),
                    eq(schema.chatSessions.userId, params.anonymousUserId),
                ),
            )
            .returning({ id: schema.chatSessions.id });

        const movedMessages = await tx
            .update(schema.chatMessages)
            .set({
                organizationId: params.targetOrganizationId,
                userId: params.newUserId,
            })
            .where(
                and(
                    eq(schema.chatMessages.organizationId, params.sourceOrganizationId),
                    eq(schema.chatMessages.userId, params.anonymousUserId),
                ),
            )
            .returning({ id: schema.chatMessages.id });

        let chatSessionStateMoved = 0;
        if (params.sourceOrganizationId !== params.targetOrganizationId) {
            const movedSessionState = await tx
                .update(schema.chatSessionState)
                .set({
                    organizationId: params.targetOrganizationId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.chatSessionState.organizationId, params.sourceOrganizationId))
                .returning({ sessionId: schema.chatSessionState.sessionId });

            chatSessionStateMoved = movedSessionState.length;
        }

        return {
            id: 'chat',
            tables,
            counts: {
                chatSessionsMoved: movedSessions.length,
                chatMessagesMoved: movedMessages.length,
                chatSessionStateMoved,
            },
        };
    },
};
