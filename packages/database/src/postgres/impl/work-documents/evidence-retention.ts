import { joinObjectPath, type DoryArtifactStore } from '@dory/artifacts';
import type { ResultSetArtifactRef } from '@dory/resultset';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { WorkEvidence } from '@dory/shared/types/work-document';
import { and, asc, eq, inArray, sql, type SQLWrapper } from 'drizzle-orm';

import { artifacts } from '../../schemas/artifacts';
import { resultSets } from '../../schemas/result-sets';
import { getResultSetMaxStorageBytesFromOrganizationMetadata } from '../organization';

type ReadDb = Pick<PostgresDBClient, 'select' | 'execute'>;

/** Only adopted evidence and the undo baseline retain modern workspace results. Legacy drafts remain recoverable. */
export function reportArtifactReference(organizationId: string, artifactId: SQLWrapper | string, documentId?: SQLWrapper | string) {
    const reference = sql`jsonb_build_array(jsonb_build_object('artifactId', ${artifactId}::text))`;
    return sql<boolean>`exists (
        select 1 from work_documents retention_document
        where retention_document.organization_id = ${organizationId}
        ${documentId ? sql`and retention_document.id = ${documentId}` : sql``}
        and (
            retention_document.content->'evidence' @> ${reference}
            or exists (select 1 from work_document_versions retention_version
                where retention_version.document_id = retention_document.id and retention_version.content->'evidence' @> ${reference})
            or exists (select 1 from report_publications retention_publication
                where retention_publication.document_id = retention_document.id and retention_publication.content->'evidence' @> ${reference})
            or exists (select 1 from report_working_drafts retention_draft
                where retention_draft.document_id = retention_document.id and (
                    retention_draft.state->'content'->'evidence' @> ${reference}
                    or retention_draft.state->'baseline'->'content'->'evidence' @> ${reference}
                    or (retention_draft.state->>'bindingVersion' is distinct from '2' and exists (select 1 from jsonb_each(retention_draft.results) retention_result
                        where retention_result.value->'evidence'->>'artifactId' = ${artifactId}::text))
                ))
        )
    )`;
}

export function reportResultSetReference(organizationId: string, resultSetId: SQLWrapper | string) {
    return sql<boolean>`exists (
        select 1 from artifacts retention_artifact
        where retention_artifact.organization_id = ${organizationId}
          and retention_artifact.source_result_set_id = ${resultSetId}
          and ${reportArtifactReference(organizationId, sql`retention_artifact.id`)}
    )`;
}

export function reportExportReference(organizationId: string, exportId: SQLWrapper | string) {
    return sql<boolean>`exists (
        select 1 from artifacts retention_export
        where retention_export.organization_id = ${organizationId} and retention_export.type = 'file'
          and retention_export.resource_id = ${exportId}
          and ${reportArtifactReference(organizationId, sql`retention_export.id`)}
    )`;
}

export async function isReportExportReferenced(db: ReadDb, organizationId: string, exportId: string) {
    const result = await db.execute<{ referenced: boolean }>(sql`select ${reportExportReference(organizationId, exportId)} as referenced`);
    return result.rows[0]?.referenced === true;
}

export async function isReportArtifactReferenced(db: ReadDb, organizationId: string, artifactId: string, documentId?: string) {
    const result = await db.execute<{ referenced: boolean }>(sql`select ${reportArtifactReference(organizationId, artifactId, documentId)} as referenced`);
    return result.rows[0]?.referenced === true;
}

export async function isReportResultSetReferenced(db: ReadDb, organizationId: string, resultSetId: string) {
    const result = await db.execute<{ referenced: boolean }>(sql`select ${reportResultSetReference(organizationId, resultSetId)} as referenced`);
    return result.rows[0]?.referenced === true;
}

/** Call inside a transaction before any destructive storage operation. Report saves take the same lock. */
export async function lockResultSet(db: ReadDb, organizationId: string, resultSetId: string) {
    const [record] = await db
        .select()
        .from(resultSets)
        .where(and(eq(resultSets.organizationId, organizationId), eq(resultSets.id, resultSetId)))
        .for('update');
    return record;
}

/** Failed multi-step producers can already have exposed a catalog entry; cleanup must obey the same lock. */
export async function discardUnreferencedResultData(db: PostgresDBClient, store: DoryArtifactStore, organizationId: string, resultSetId: string, ref: ResultSetArtifactRef) {
    await db.transaction(async tx => {
        const record = await lockResultSet(tx, organizationId, resultSetId);
        if (record && (record.pinnedAt || (await isReportResultSetReferenced(tx, organizationId, resultSetId)))) return;
        await store.resultSets.deleteResultSet(ref);
    });
}

/** Validate and lock references before committing JSON; never enlarges the embedded report preview. */
export async function retainReportEvidence(db: ReadDb, organizationId: string, evidence: WorkEvidence[], documentId?: string) {
    const ids = [...new Set(evidence.map(item => item.artifactId))];
    if (!ids.length) return;
    const sources = await db
        .select({ id: artifacts.id, resultSetId: artifacts.sourceResultSetId })
        .from(artifacts)
        .where(and(eq(artifacts.organizationId, organizationId), inArray(artifacts.id, ids)));
    const resultIds = [...new Set(sources.flatMap(item => (item.resultSetId ? [item.resultSetId] : [])))].sort();
    if (resultIds.length) {
        await db
            .select({ id: resultSets.id })
            .from(resultSets)
            .where(and(eq(resultSets.organizationId, organizationId), inArray(resultSets.id, resultIds)))
            .orderBy(asc(resultSets.id))
            .for('update');
    }
    // Re-read after the lock: deletion may have committed while this transaction waited.
    const available = await db
        .select({ artifactId: artifacts.id, resultSet: resultSets })
        .from(artifacts)
        .innerJoin(resultSets, and(eq(resultSets.organizationId, artifacts.organizationId), eq(resultSets.id, artifacts.sourceResultSetId)))
        .where(and(eq(artifacts.organizationId, organizationId), inArray(artifacts.id, ids)));
    for (const id of ids) {
        const existingReference = documentId ? await isReportArtifactReferenced(db, organizationId, id, documentId) : false;
        const record = available.find(item => item.artifactId === id)?.resultSet;
        // Legacy reports retain their embedded preview even when their former full result is gone.
        if (existingReference) continue;
        if (!record || record.status !== 'success' || record.dataAvailability === 'none')
            throw new DatabaseError('Report evidence is no longer available. Run the query again before adding it.', 409);
        if (record.expiresAt && record.expiresAt.getTime() <= Date.now() && !record.pinnedAt && !(await isReportResultSetReferenced(db, organizationId, record.id)))
            throw new DatabaseError('Report evidence has expired. Run the query again before adding it.', 409);
    }
}

/** Publication verifies durable data, not a stale catalog flag or the embedded preview. */
export async function validateReportPublicationEvidence(db: ReadDb, store: DoryArtifactStore, organizationId: string, evidence: WorkEvidence[], documentId: string) {
    await retainReportEvidence(db, organizationId, evidence, documentId);
    if (evidence.length) {
        const capacity = await db.execute<{ metadata: string | null; bytes: string }>(sql`
            select (select metadata from organizations where id = ${organizationId}) as metadata,
                (coalesce((select sum(byte_size) from result_sets where organization_id = ${organizationId}), 0)
                 + coalesce((select sum(byte_size) from result_set_exports where organization_id = ${organizationId}), 0))::text as bytes
        `);
        if (Number(capacity.rows[0]?.bytes ?? 0) > getResultSetMaxStorageBytesFromOrganizationMetadata(capacity.rows[0]?.metadata))
            throw new DatabaseError('Workspace storage limit reached. Free unreferenced results before saving a report version. Your draft is preserved.', 409);
    }
    for (const id of new Set(evidence.map(item => item.artifactId))) {
        const [source] = await db
            .select({ result: resultSets })
            .from(artifacts)
            .innerJoin(resultSets, and(eq(resultSets.organizationId, artifacts.organizationId), eq(resultSets.id, artifacts.sourceResultSetId)))
            .where(and(eq(artifacts.organizationId, organizationId), eq(artifacts.id, id)));
        try {
            if (!source || source.result.status !== 'success' || source.result.dataAvailability !== 'full' || source.result.limited) throw new Error('Incomplete result.');
            const manifest = await store.resultSets.readManifest(source.result.artifactRefJson);
            const parts = manifest.files.data?.parts;
            if (
                manifest.organizationId !== organizationId ||
                manifest.artifactId !== source.result.id ||
                manifest.status !== 'success' ||
                manifest.limited ||
                !parts?.length ||
                manifest.rowCount == null ||
                manifest.rowCount !== source.result.rowCount ||
                parts.some(part => part.rowCount == null) ||
                parts.reduce((total, part) => total + (part.rowCount ?? 0), 0) !== manifest.rowCount
            )
                throw new Error('Incomplete result manifest.');
            for (const part of parts) {
                if (!part.path.startsWith('data/') || part.path.split('/').includes('..')) throw new Error('Invalid data path.');
                const saved = await store.objectStore.stat(joinObjectPath(source.result.artifactRefJson.basePath, part.path));
                if (!saved || (part.byteSize != null && saved.byteSize !== part.byteSize)) throw new Error('Missing or incomplete result data.');
            }
        } catch {
            throw new DatabaseError('A complete retained result is required before saving a report version. Your draft and its preview are preserved.', 409);
        }
    }
}
