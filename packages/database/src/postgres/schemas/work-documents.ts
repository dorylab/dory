import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnalysisScope, WorkDocumentContent } from '@dory/shared/types/work-document';
import { newEntityId } from '@dory/shared/id';

export const workDocuments = pgTable(
    'work_documents',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `doc_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        creationKey: text('creation_key').notNull(),
        chatId: text('chat_id'),
        title: text('title').notNull(),
        scope: jsonb('scope').$type<AnalysisScope>().notNull(),
        content: jsonb('content').$type<WorkDocumentContent>().notNull(),
        revision: integer('revision').notNull().default(1),
        status: text('status').$type<'draft' | 'ready'>().notNull().default('draft'),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('work_documents_creation_key').on(table.organizationId, table.userId, table.creationKey),
        index('work_documents_owner_updated').on(table.organizationId, table.userId, table.updatedAt),
    ],
);
export const workDocumentVersions = pgTable(
    'work_document_versions',
    {
        documentId: text('document_id')
            .notNull()
            .references(() => workDocuments.id, { onDelete: 'cascade' }),
        revision: integer('revision').notNull(),
        title: text('title').notNull(),
        content: jsonb('content').$type<WorkDocumentContent>().notNull(),
        scope: jsonb('scope').$type<AnalysisScope>().notNull(),
        status: text('status').$type<'draft' | 'ready'>().notNull(),
        source: text('source').$type<'user' | 'agent' | 'restore'>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [primaryKey({ columns: [table.documentId, table.revision] })],
);
