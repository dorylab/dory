import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    AgentRunArtifactStore,
    ChatAttachmentStore,
    ComparisonArtifactStore,
    ExportRunArtifactStore,
    FilesystemObjectStore,
    ImportRunArtifactStore,
    ResultSetArtifactStore,
} from '@dory/artifacts';
import type { PostgresDBClient } from '@dory/shared';
import type { WorkEvidence } from '@dory/shared/types/work-document';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { PostgresArtifactsRepository } from '../../src/postgres/impl/artifacts';
import { PostgresResultSetsRepository } from '../../src/postgres/impl/result-sets';
import { PostgresWorkDocumentsRepository } from '../../src/postgres/impl/work-documents';
import { artifacts } from '../../src/postgres/schemas/artifacts';

export async function reportRetentionFixture() {
    const client = new PGlite();
    const db = drizzle(client) as unknown as PostgresDBClient;
    await migrate(db as unknown as ReturnType<typeof drizzle>, { migrationsFolder: new URL('../../src/pglite/migrations', import.meta.url).pathname });
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-report-retention-'));
    const objectStore = new FilesystemObjectStore(directory);
    const store = {
        objectStore,
        resultSets: new ResultSetArtifactStore(objectStore, ''),
        agentRuns: new AgentRunArtifactStore(objectStore, ''),
        chatAttachments: new ChatAttachmentStore(objectStore, ''),
        comparisons: new ComparisonArtifactStore(objectStore, ''),
        exportRuns: new ExportRunArtifactStore(objectStore, ''),
        importRuns: new ImportRunArtifactStore(objectStore, ''),
    };
    const reports = new PostgresWorkDocumentsRepository(store);
    const results = new PostgresResultSetsRepository(store);
    const catalog = new PostgresArtifactsRepository();
    await Promise.all([reports.init(db), results.init(db), catalog.init(db)]);
    async function seedEvidence(artifactId: string, rows: Record<string, unknown>[] = [{ value: 1 }], sqlText = 'select value from fixture'): Promise<WorkEvidence> {
        const output = await results.persistQueryResultSet({
            organizationId: 'org',
            userId: 'alice',
            sessionId: `session_${artifactId}`,
            sessionSqlText: sqlText,
            resultSet: {
                sessionId: `session_${artifactId}`,
                setIndex: 0,
                sqlText,
                status: 'success',
                rowCount: rows.length,
                columns: Object.keys(rows[0] ?? { value: 0 }).map(name => ({ name, type: 'Int64' })),
            },
            rows,
        });
        await db.update(artifacts).set({ id: artifactId }).where(eq(artifacts.sourceResultSetId, output.resultSetId));
        return {
            artifactId,
            title: artifactId,
            connectionId: null,
            connectionName: null,
            sql: sqlText,
            capturedAt: new Date(output.createdAt).toISOString(),
            columns: output.schema.map(column => column.name),
            rows: rows.slice(0, 500),
            rowCount: rows.length,
            truncated: rows.length > 500,
            runId: null,
        };
    }
    return {
        client,
        db,
        store,
        reports,
        results,
        catalog,
        seedEvidence,
        async close() {
            await client.close();
            await rm(directory, { recursive: true, force: true });
        },
    };
}
