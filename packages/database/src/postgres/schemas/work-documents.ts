import { newEntityId } from '@dory/shared/id';
import type { AnalysisScope, WorkDocumentContent, WorkEvidence } from '@dory/shared/types/work-document';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
        publishedVersionId: text('published_version_id'),
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

export const reportSnapshots = pgTable(
    'report_snapshots',
    {
        id: text('id').primaryKey(),
        documentId: text('document_id')
            .notNull()
            .references(() => workDocuments.id, { onDelete: 'cascade' }),
        evidence: jsonb('evidence').$type<WorkEvidence>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('report_snapshots_document').on(table.documentId)],
);
export const reportPublications = pgTable(
    'report_publications',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `pub_${newEntityId()}`),
        documentId: text('document_id')
            .notNull()
            .references(() => workDocuments.id, { onDelete: 'cascade' }),
        number: integer('number').notNull(),
        revision: integer('revision').notNull(),
        requestId: text('request_id').notNull(),
        title: text('title').notNull(),
        content: jsonb('content').$type<WorkDocumentContent>().notNull(),
        scope: jsonb('scope').$type<AnalysisScope>().notNull(),
        chatId: text('chat_id'),
        publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('report_publications_number').on(table.documentId, table.number),
        uniqueIndex('report_publications_request').on(table.documentId, table.requestId),
        uniqueIndex('report_publications_revision').on(table.documentId, table.revision),
    ],
);
