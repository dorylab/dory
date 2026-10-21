import { createHash, randomUUID } from 'node:crypto';
import type { PostgresDBClient } from '@dory/shared';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm';

import {
    knowledgeAssetSources,
    knowledgeConnectorItems,
    knowledgeConnectors,
    knowledgeModels,
    knowledgeModelSources,
    knowledgeSources,
    type KnowledgeDefinition,
} from '../../schemas/knowledge';
import {
    knowledgeCandidates as candidates,
    knowledgeEvidence as evidence,
    knowledgeProcessingHistory as historyEvents,
    knowledgeExtractionJobs as jobs,
    knowledgeMetricRules as metricRules,
    knowledgeOrganizationJobs as organizationJobs,
    knowledgePublicationJobs as publicationJobs,
    knowledgeBusinessRules as rules,
    type ExtractedCandidate,
    type ExtractedKnowledge,
} from '../../schemas/knowledge-extraction';
import { validateKnowledgeModelDocument } from './index';
import { enqueueOrganization, KnowledgeOrganizationStore } from './organization';
import { applyKnowledgeDefinitions, ossieRevision, projectOssieDocument, serializeOssieDocument } from './ossie';
import { KnowledgePublicationStore } from './publication';

export const EXTRACTION_VERSION = 5;
type Executor = Pick<PostgresDBClient, 'select' | 'insert' | 'update' | 'delete'>;
export type ModelScope = { organizationId: string; knowledgeModelId: string };
export function knowledgeHash(value: unknown): string {
    const stable = (v: unknown): unknown =>
        Array.isArray(v)
            ? v.map(stable)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                    Object.entries(v)
                        .filter(([, entry]) => entry !== undefined)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, entry]) => [key, stable(entry)]),
                )
              : v;
    return createHash('sha256')
        .update(typeof value === 'string' ? value : JSON.stringify(stable(value)))
        .digest('hex');
}
export const knowledgeItemKey = (p: ExtractedKnowledge) =>
    `${p.kind}:${p.name
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\p{P}]+/gu, '')}:${p.sourceConnectionId ?? '*'}`;
const scope = (table: typeof candidates | typeof rules | typeof jobs | typeof evidence, input: ModelScope) =>
    and(eq(table.organizationId, input.organizationId), eq(table.knowledgeModelId, input.knowledgeModelId));

export async function enqueueSourceExtraction(db: Executor, connector: typeof knowledgeConnectors.$inferSelect, source: typeof knowledgeSources.$inferSelect) {
    if (!connector.autoExtract) return;
    const [model] = await db.select().from(knowledgeModels).where(eq(knowledgeModels.id, connector.knowledgeModelId));
    // A previously seen source version stays manual even when re-extracted with a new prompt.
    const previous = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.originalSourceId, source.id), eq(jobs.sourceHash, knowledgeHash(source.contentText))))
        .limit(1);
    await db
        .insert(jobs)
        .values({
            organizationId: connector.organizationId,
            knowledgeModelId: connector.knowledgeModelId,
            connectorId: connector.id,
            sourceId: source.id,
            originalSourceId: source.id,
            sourceHash: knowledgeHash(source.contentText),
            publicationEpoch: model?.publicationMode === 'automatic' && !previous.length ? model.publicationEpoch : null,
            extractionVersion: EXTRACTION_VERSION,
            createdBy: connector.createdBy,
        })
        .onConflictDoNothing();
}

export async function copyDraftEvidence(db: Executor, candidateId: string, links: Array<typeof evidence.$inferSelect>) {
    for (const entry of links) {
        const [existing] = await db
            .select({ id: evidence.id })
            .from(evidence)
            .where(
                and(
                    eq(evidence.candidateId, candidateId),
                    eq(evidence.originalSourceId, entry.originalSourceId),
                    eq(evidence.sourceHash, entry.sourceHash),
                    eq(evidence.quote, entry.quote),
                ),
            );
        if (!existing)
            await db.insert(evidence).values({
                organizationId: entry.organizationId,
                knowledgeModelId: entry.knowledgeModelId,
                candidateId,
                sourceId: entry.sourceId,
                originalSourceId: entry.originalSourceId,
                sourceHash: entry.sourceHash,
                sourceTitle: entry.sourceTitle,
                sourceUrl: entry.sourceUrl,
                quote: entry.quote,
                state: entry.state,
                assetId: null,
                assetType: null,
            });
    }
}

export async function invalidateSourceEvidence(db: Executor, sourceId: string, state: 'outdated' | 'missing') {
    const oldEvidence = await db
        .select()
        .from(evidence)
        .where(and(eq(evidence.originalSourceId, sourceId), state === 'missing' ? ne(evidence.state, 'missing') : eq(evidence.state, 'current')));
    await db.update(evidence).set({ state }).where(eq(evidence.originalSourceId, sourceId));
    await db
        .update(jobs)
        .set({ status: 'cancelled', leaseToken: null, updatedAt: new Date() })
        .where(and(eq(jobs.originalSourceId, sourceId), inArray(jobs.status, ['queued', 'running', 'blocked', 'failed'])));
    const pending = [...new Set(oldEvidence.filter(e => !e.assetId).map(e => e.candidateId))];
    const pendingDrafts = pending.length
        ? await db
              .select()
              .from(candidates)
              .where(and(inArray(candidates.id, pending), eq(candidates.status, 'pending')))
        : [];
    if (pendingDrafts.length)
        await db
            .update(candidates)
            .set({ status: 'superseded', updatedAt: new Date() })
            .where(
                inArray(
                    candidates.id,
                    pendingDrafts.map(d => d.id),
                ),
            );
    // A merged draft may still be independently supported by other current
    // documents. Preserve those proposals without carrying forward stale quotes.
    for (const draft of pendingDrafts) {
        const remaining = await db
            .select()
            .from(evidence)
            .where(and(eq(evidence.candidateId, draft.id), eq(evidence.state, 'current')));
        if (!remaining.length) continue;
        let [replacement] = await db
            .select()
            .from(candidates)
            .where(and(scope(candidates, draft), eq(candidates.itemKey, draft.itemKey), eq(candidates.payloadHash, draft.payloadHash), eq(candidates.status, 'pending')));
        if (!replacement)
            [replacement] = await db
                .insert(candidates)
                .values({
                    organizationId: draft.organizationId,
                    knowledgeModelId: draft.knowledgeModelId,
                    itemKey: draft.itemKey,
                    payloadHash: draft.payloadHash,
                    payload: draft.payload,
                    action: draft.action,
                    targetAssetId: draft.targetAssetId,
                    targetRevision: draft.targetRevision,
                })
                .returning();
        await copyDraftEvidence(db, replacement.id, remaining);
    }
    for (const entry of new Map(oldEvidence.filter(e => e.assetId).map(e => [e.assetId, e])).values()) {
        const [original] = await db.select().from(candidates).where(eq(candidates.id, entry.candidateId));
        if (!original) continue;
        const [model] = await db.select().from(knowledgeModels).where(eq(knowledgeModels.id, entry.knowledgeModelId));
        if (!model) continue;
        const [rule] = entry.assetType === 'business_rule' ? await db.select().from(rules).where(eq(rules.id, entry.assetId!)) : [];
        const definition = entry.assetType === 'definition' ? projectOssieDocument(model.modelJson).definitions.find(d => d.id === entry.assetId) : null;
        const targetRevision = rule ? String(rule.revision) : definition ? knowledgeHash(definition) : null;
        if (!targetRevision) continue;
        const itemKey = `source-${state}:${sourceId}:${entry.assetId}`;
        const [existing] = await db
            .select()
            .from(candidates)
            .where(and(scope(candidates, entry), eq(candidates.itemKey, itemKey), eq(candidates.status, 'pending')));
        if (existing) continue;
        const [review] = await db
            .insert(candidates)
            .values({
                organizationId: entry.organizationId,
                knowledgeModelId: entry.knowledgeModelId,
                itemKey,
                payloadHash: original.payloadHash,
                payload: original.payload,
                action: state === 'missing' ? 'remove' : 'source_changed',
                targetAssetId: entry.assetId,
                targetRevision,
            })
            .returning();
        await db.insert(evidence).values({
            organizationId: entry.organizationId,
            knowledgeModelId: entry.knowledgeModelId,
            candidateId: review.id,
            sourceId: state === 'missing' ? null : entry.sourceId,
            originalSourceId: sourceId,
            sourceHash: entry.sourceHash,
            sourceTitle: entry.sourceTitle,
            sourceUrl: entry.sourceUrl,
            quote: entry.quote,
            state,
        });
    }
}

export class KnowledgeExtractionStore {
    constructor(private readonly db: PostgresDBClient) {}
    get publication() {
        return new KnowledgePublicationStore(this.db, this);
    }
    get organization() {
        return new KnowledgeOrganizationStore(this.db);
    }
    async assertModel(input: ModelScope) {
        const [model] = await this.db
            .select()
            .from(knowledgeModels)
            .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
        if (!model) throw new Error('Knowledge model not found.');
        return model;
    }
    async status(input: ModelScope) {
        await this.assertModel(input);
        const [connectors, allJobs, drafts] = await Promise.all([
            this.db
                .select({ id: knowledgeConnectors.id, autoExtract: knowledgeConnectors.autoExtract })
                .from(knowledgeConnectors)
                .where(and(eq(knowledgeConnectors.organizationId, input.organizationId), eq(knowledgeConnectors.knowledgeModelId, input.knowledgeModelId))),
            this.db.select().from(jobs).where(scope(jobs, input)).orderBy(desc(jobs.createdAt)),
            this.db
                .select({ id: candidates.id, kind: candidates.payload, action: candidates.action })
                .from(candidates)
                .where(and(scope(candidates, input), eq(candidates.status, 'pending'))),
        ]);
        // Only the current revision is displayed; completed audit jobs remain persisted.
        const currentJobs = [
            ...new Map(
                allJobs
                    .slice()
                    .reverse()
                    .map(job => [job.originalSourceId, job]),
            ).values(),
        ];
        const pendingEvidence = drafts.length
            ? await this.db
                  .select({ sourceId: evidence.originalSourceId, candidateId: evidence.candidateId })
                  .from(evidence)
                  .where(
                      inArray(
                          evidence.candidateId,
                          drafts.map(d => d.id),
                      ),
                  )
            : [];
        return {
            connectors,
            jobs: currentJobs.map(job => ({
                id: job.id,
                connectorId: job.connectorId,
                originalSourceId: job.originalSourceId,
                status: job.status,
                completedChunks: job.completedChunks,
                totalChunks: job.totalChunks,
                error: job.error,
                pendingCount: new Set(pendingEvidence.filter(e => e.sourceId === job.originalSourceId).map(e => e.candidateId)).size,
            })),
            organizationJob:
                (
                    await this.db
                        .select({ id: organizationJobs.id, status: organizationJobs.status, error: organizationJobs.error, lastCompletedAt: organizationJobs.lastCompletedAt })
                        .from(organizationJobs)
                        .where(eq(organizationJobs.knowledgeModelId, input.knowledgeModelId))
                )[0] ?? null,
            pendingCount: drafts.length,
        };
    }
    async configure(input: ModelScope & { connectorId: string; enabled: boolean }) {
        await this.assertModel(input);
        await this.db.transaction(async tx => {
            const [connector] = await tx
                .update(knowledgeConnectors)
                .set({ autoExtract: input.enabled })
                .where(
                    and(
                        eq(knowledgeConnectors.id, input.connectorId),
                        eq(knowledgeConnectors.organizationId, input.organizationId),
                        eq(knowledgeConnectors.knowledgeModelId, input.knowledgeModelId),
                    ),
                )
                .returning();
            if (!connector) throw new Error('Knowledge connector not found.');
            await tx.select().from(knowledgeModels).where(eq(knowledgeModels.id, input.knowledgeModelId)).for('update');
            if (!input.enabled) {
                await tx.update(organizationJobs).set({ status: 'completed', leaseToken: null, error: null }).where(eq(organizationJobs.knowledgeModelId, input.knowledgeModelId));
                await tx
                    .update(jobs)
                    .set({ status: 'cancelled', leaseToken: null })
                    .where(and(eq(jobs.connectorId, connector.id), inArray(jobs.status, ['queued', 'running', 'blocked', 'failed'])));
                return;
            }
            await enqueueOrganization(tx, inputScope(input));
            const sources = await tx
                .select({ source: knowledgeSources })
                .from(knowledgeSources)
                .innerJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
                .where(eq(knowledgeConnectorItems.connectorId, connector.id));
            for (const { source } of sources) {
                await enqueueSourceExtraction(tx, connector, source);
                await tx
                    .update(jobs)
                    .set({ status: 'queued', attempts: 0, availableAt: sql`clock_timestamp()`, error: null })
                    .where(
                        and(
                            eq(jobs.connectorId, connector.id),
                            eq(jobs.originalSourceId, source.id),
                            eq(jobs.sourceHash, knowledgeHash(source.contentText)),
                            eq(jobs.extractionVersion, EXTRACTION_VERSION),
                            inArray(jobs.status, ['cancelled', 'failed', 'blocked']),
                        ),
                    );
            }
        });
    }
    async retry(input: ModelScope & { sourceId?: string }) {
        await this.assertModel(input);
        await this.db.transaction(async tx => {
            const rows = await tx
                .select({ job: jobs, source: knowledgeSources })
                .from(jobs)
                .innerJoin(knowledgeSources, eq(jobs.sourceId, knowledgeSources.id))
                .innerJoin(knowledgeConnectors, eq(jobs.connectorId, knowledgeConnectors.id))
                .where(
                    and(
                        scope(jobs, input),
                        input.sourceId ? eq(jobs.originalSourceId, input.sourceId) : undefined,
                        eq(jobs.extractionVersion, EXTRACTION_VERSION),
                        eq(knowledgeConnectors.autoExtract, true),
                        inArray(jobs.status, ['failed', 'blocked']),
                    ),
                );
            const ids = rows.filter(row => row.job.sourceHash === knowledgeHash(row.source.contentText)).map(row => row.job.id);
            if (ids.length)
                await tx
                    .update(jobs)
                    .set({ status: 'queued', attempts: 0, error: null, availableAt: sql`clock_timestamp()`, updatedAt: new Date() })
                    .where(inArray(jobs.id, ids));
        });
    }

    async claim() {
        return this.db.transaction(async tx => {
            await tx
                .update(jobs)
                .set({ status: 'failed', leaseToken: null, error: 'Extraction lease expired after five attempts. Retry after checking the worker.', updatedAt: new Date() })
                .where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, sql`clock_timestamp()`), gte(jobs.attempts, 5)));
            await tx
                .update(jobs)
                .set({ status: 'queued', leaseToken: null, updatedAt: new Date() })
                .where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, sql`clock_timestamp()`), lt(jobs.attempts, 5)));
            const [job] = await tx
                .select({ job: jobs })
                .from(jobs)
                .innerJoin(knowledgeConnectors, eq(jobs.connectorId, knowledgeConnectors.id))
                .where(
                    and(
                        eq(jobs.status, 'queued'),
                        lt(jobs.attempts, 5),
                        lte(jobs.availableAt, sql`clock_timestamp()`),
                        eq(knowledgeConnectors.autoExtract, true),
                        ne(knowledgeConnectors.status, 'disabled'),
                        isNotNull(jobs.sourceId),
                    ),
                )
                .orderBy(asc(jobs.availableAt))
                .limit(1)
                .for('update', { skipLocked: true, of: jobs });
            if (!job) return null;
            const [claimed] = await tx
                .update(jobs)
                .set({
                    status: 'running',
                    attempts: job.job.attempts + 1,
                    leaseToken: randomUUID(),
                    leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'`,
                    error: null,
                    updatedAt: new Date(),
                })
                .where(eq(jobs.id, job.job.id))
                .returning();
            return claimed;
        });
    }
    async heartbeat(id: string, leaseToken: string, completedChunks?: number, totalChunks?: number) {
        const [row] = await this.db
            .update(jobs)
            .set({
                leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'`,
                updatedAt: new Date(),
                ...(completedChunks === undefined ? {} : { completedChunks, totalChunks }),
            })
            .where(and(eq(jobs.id, id), eq(jobs.leaseToken, leaseToken), eq(jobs.status, 'running'), gt(jobs.leaseExpiresAt, sql`clock_timestamp()`)))
            .returning({ id: jobs.id });
        if (!row) throw new Error('Extraction job is no longer active.');
    }
    async fail(id: string, leaseToken: string, error: string, retry: boolean, blocked = false) {
        const [job] = await this.db.select().from(jobs).where(eq(jobs.id, id));
        if (!job) return;
        const again = retry && job.attempts < 5;
        await this.db
            .update(jobs)
            .set({
                status: blocked ? 'blocked' : again ? 'queued' : 'failed',
                error: error.slice(0, 1000),
                leaseToken: null,
                availableAt: sql`clock_timestamp() + ${30_000 * 2 ** (job.attempts - 1)} * interval '1 millisecond'`,
                updatedAt: new Date(),
            })
            .where(and(eq(jobs.id, id), eq(jobs.leaseToken, leaseToken), eq(jobs.status, 'running')));
    }
    async complete(jobId: string, leaseToken: string, output: ExtractedCandidate[]) {
        return this.db.transaction(async tx => {
            const [initial] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
            if (!initial) throw new Error('Extraction job no longer exists.');
            const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, initial.connectorId)).for('update');
            const [model] = await tx.select().from(knowledgeModels).where(eq(knowledgeModels.id, initial.knowledgeModelId)).for('update');
            const [job] = await tx
                .select()
                .from(jobs)
                .where(and(eq(jobs.id, jobId), eq(jobs.leaseToken, leaseToken), eq(jobs.status, 'running'), gt(jobs.leaseExpiresAt, sql`clock_timestamp()`)))
                .for('update');
            if (!job?.sourceId || !job.leaseExpiresAt) throw new Error('Extraction lease expired.');
            const [source] = await tx
                .select({ source: knowledgeSources, sourceUrl: knowledgeConnectorItems.sourceUrl })
                .from(knowledgeSources)
                .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
                .where(eq(knowledgeSources.id, job.sourceId));
            if (!connector?.autoExtract || connector.status === 'disabled' || !source || knowledgeHash(source.source.contentText) !== job.sourceHash)
                throw new Error('Extraction source changed.');
            const previousDrafts = await tx
                .select({ id: candidates.id })
                .from(candidates)
                .innerJoin(evidence, eq(evidence.candidateId, candidates.id))
                .where(and(scope(candidates, job), eq(candidates.status, 'pending'), eq(evidence.originalSourceId, job.originalSourceId), ne(candidates.jobId, job.id)));
            if (previousDrafts.length)
                await tx
                    .update(candidates)
                    .set({ status: 'superseded', updatedAt: new Date() })
                    .where(
                        inArray(
                            candidates.id,
                            previousDrafts.map(c => c.id),
                        ),
                    );
            const definitions = projectOssieDocument(model.modelJson).definitions;
            const businessRules = await tx
                .select()
                .from(rules)
                .where(and(scope(rules, job), eq(rules.status, 'active')));
            for (const item of output) {
                if (!item.quotes.length || item.quotes.some(quote => !quote.trim() || !source.source.contentText.includes(quote)))
                    throw new Error('Extraction evidence does not match the source.');
                const key = knowledgeItemKey(item.payload),
                    hash = knowledgeHash(item.payload);
                const matches = await tx
                    .select()
                    .from(candidates)
                    .where(and(scope(candidates, job), eq(candidates.itemKey, key), eq(candidates.payloadHash, hash), inArray(candidates.status, ['pending', 'approved'])));
                const matching = matches.find(c => c.status === 'pending');
                const approved = matches.find(
                    c =>
                        c.status === 'approved' &&
                        c.targetAssetId &&
                        (c.payload.kind === 'metric'
                            ? definitions.some(d => d.id === c.targetAssetId && knowledgeHash(d) === c.targetRevision)
                            : businessRules.some(r => r.id === c.targetAssetId && String(r.revision) === c.targetRevision)),
                );
                const sameName = (name: string) =>
                    name
                        .normalize('NFKC')
                        .toLocaleLowerCase()
                        .replace(/[\s\p{P}]+/gu, '') ===
                    item.payload.name
                        .normalize('NFKC')
                        .toLocaleLowerCase()
                        .replace(/[\s\p{P}]+/gu, '');
                const targets =
                    item.payload.kind === 'metric'
                        ? definitions
                              .filter(
                                  d => d.kind === 'metric' && sameName(d.name) && (!item.payload.sourceConnectionId || d.sourceConnectionId === item.payload.sourceConnectionId),
                              )
                              .map(d => ({ id: d.id, revision: knowledgeHash(d) }))
                        : businessRules
                              .filter(r => sameName(r.payload.name) && r.payload.sourceConnectionId === item.payload.sourceConnectionId)
                              .map(r => ({ id: r.id, revision: String(r.revision) }));
                const siblings = await tx
                    .select({ id: candidates.id })
                    .from(candidates)
                    .where(and(scope(candidates, job), eq(candidates.itemKey, key), ne(candidates.payloadHash, hash), eq(candidates.status, 'pending')));
                const action = siblings.length || (targets.length && !approved) ? ('conflict' as const) : approved ? ('update' as const) : ('add' as const);
                if (siblings.length)
                    await tx
                        .update(candidates)
                        .set({ action: 'conflict' })
                        .where(
                            inArray(
                                candidates.id,
                                siblings.map(c => c.id),
                            ),
                        );
                const [created] = matching
                    ? [matching]
                    : await tx
                          .insert(candidates)
                          .values({
                              organizationId: job.organizationId,
                              knowledgeModelId: job.knowledgeModelId,
                              jobId,
                              itemKey: key,
                              payloadHash: hash,
                              payload: item.payload,
                              action,
                              targetAssetId: targets.length === 1 ? targets[0].id : null,
                              targetRevision: targets.length === 1 ? targets[0].revision : null,
                          })
                          .returning();
                // Additional evidence is reviewable knowledge too. Copy previously
                // reviewed evidence into a new draft without attaching new material
                // to a published asset before an administrator approves it.
                if (!matching && approved) {
                    const previousEvidence = await tx
                        .select()
                        .from(evidence)
                        .where(and(eq(evidence.candidateId, approved.id), eq(evidence.assetId, approved.targetAssetId!), eq(evidence.state, 'current')));
                    await copyDraftEvidence(tx, created.id, previousEvidence);
                }
                for (const quote of [...new Set(item.quotes)]) {
                    const [existing] = await tx
                        .select({ id: evidence.id })
                        .from(evidence)
                        .where(
                            and(
                                eq(evidence.candidateId, created.id),
                                eq(evidence.originalSourceId, source.source.id),
                                eq(evidence.sourceHash, job.sourceHash),
                                eq(evidence.quote, quote),
                            ),
                        );
                    if (!existing)
                        await tx.insert(evidence).values({
                            organizationId: job.organizationId,
                            knowledgeModelId: job.knowledgeModelId,
                            candidateId: created.id,
                            assetType: null,
                            assetId: null,
                            sourceId: source.source.id,
                            originalSourceId: source.source.id,
                            sourceHash: job.sourceHash,
                            sourceTitle: knowledgeSourceDisplayName({ fileName: source.source.fileName, sourceUrl: source.sourceUrl }),
                            sourceUrl: source.sourceUrl,
                            quote,
                        });
                }
            }
            await tx.update(jobs).set({ status: 'completed', leaseToken: null, error: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
        });
    }
    async listCandidates(input: ModelScope & { status?: 'pending' | 'approved' | 'rejected' | 'superseded' }) {
        await this.assertModel(input);
        const rows = await this.db
            .select()
            .from(candidates)
            .where(and(scope(candidates, input), eq(candidates.status, input.status ?? 'pending')))
            .orderBy(desc(candidates.createdAt));
        if (!rows.length) return [];
        const links = await this.db
            .select()
            .from(evidence)
            .where(
                inArray(
                    evidence.candidateId,
                    rows.map(c => c.id),
                ),
            );
        const dependencyIds = [...new Set(rows.flatMap(row => row.payload.ruleCandidateIds ?? []))];
        const dependencies = dependencyIds.length
            ? await this.db
                  .select()
                  .from(candidates)
                  .where(and(scope(candidates, input), inArray(candidates.id, dependencyIds), eq(candidates.status, 'approved')))
            : [];
        const publicationTasks = await this.db
            .select()
            .from(publicationJobs)
            .where(and(eq(publicationJobs.knowledgeModelId, input.knowledgeModelId), eq(publicationJobs.organizationId, input.organizationId)));
        return rows.map(row => ({
            ...row,
            publicationReason: publicationTasks.find(task => task.candidateId === row.id)?.error ?? null,
            payload: dependencies.some(d => row.payload.ruleCandidateIds?.includes(d.id))
                ? {
                      ...row.payload,
                      ruleIds: [
                          ...new Set([
                              ...(row.payload.ruleIds ?? []),
                              ...dependencies.filter(d => row.payload.ruleCandidateIds?.includes(d.id)).flatMap(d => (d.targetAssetId ? [d.targetAssetId] : [])),
                          ]),
                      ],
                  }
                : row.payload,
            evidence: links
                .filter(e => e.candidateId === row.id)
                .map(e => ({ ...e, sourceTitle: knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl }) })),
        }));
    }
    async listRules(input: ModelScope & { includeArchived?: boolean }) {
        await this.assertModel(input);
        const rows = await this.db
            .select()
            .from(rules)
            .where(and(scope(rules, input), input.includeArchived ? undefined : eq(rules.status, 'active')))
            .orderBy(desc(rules.updatedAt));
        const links = await this.db
            .select()
            .from(evidence)
            .where(and(scope(evidence, input), eq(evidence.assetType, 'business_rule'), isNotNull(evidence.assetId)));
        const references = await this.db.select().from(metricRules).where(eq(metricRules.knowledgeModelId, input.knowledgeModelId));
        const definitions = projectOssieDocument((await this.assertModel(input)).modelJson).definitions;
        return rows.map(row => ({
            ...row,
            payload: { ...row.payload, applicationScope: row.applicationScope, metricIds: references.filter(ref => ref.ruleId === row.id).map(ref => ref.metricId) },
            metricIds: references.filter(ref => ref.ruleId === row.id).map(ref => ref.metricId),
            metrics: definitions
                .filter(d => references.some(ref => ref.ruleId === row.id && ref.metricId === d.id))
                .map(d => ({ id: d.id, name: d.name, sourceConnectionId: d.sourceConnectionId })),
            evidence: links.filter(e => e.assetId === row.id).map(e => ({ ...e, sourceTitle: knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl }) })),
            sourceState: links.some(e => e.assetId === row.id && e.state !== 'current') ? ('outdated' as const) : ('current' as const),
        }));
    }
    async evidenceFor(input: ModelScope & { assetId?: string }) {
        await this.assertModel(input);
        const rows = await this.db
            .select()
            .from(evidence)
            .where(and(scope(evidence, input), isNotNull(evidence.assetId), input.assetId ? eq(evidence.assetId, input.assetId) : undefined));
        return rows.map(e => ({ ...e, sourceTitle: knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl }) }));
    }
    async review(
        input: ModelScope & {
            candidateId: string;
            userId: string;
            automatic?: boolean;
            decision: 'approve' | 'reject' | 'keep' | 'archive';
            payload?: ExtractedKnowledge;
            targetAssetId?: string;
            createNew?: boolean;
            expectedTargetRevision?: string;
            expectedRuleRevisions?: Record<string, number>;
            expectedMetricRevisions?: Record<string, string>;
            note?: string;
        },
        executor?: Executor,
    ) {
        const publish = async (tx: Executor) => {
            const [model] = await tx
                .select()
                .from(knowledgeModels)
                .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)))
                .for('update');
            if (!model) throw new Error('Knowledge model not found.');
            const [draft] = await tx
                .select()
                .from(candidates)
                .where(and(eq(candidates.id, input.candidateId), scope(candidates, input)))
                .for('update');
            if (!draft || draft.status !== 'pending') throw new Error('Candidate is no longer pending.');
            const links = await tx.select().from(evidence).where(eq(evidence.candidateId, draft.id));
            if (!links.length) throw new Error('Candidate has no source evidence.');
            const invalidation = draft.action === 'source_changed' || draft.action === 'remove';
            if (input.decision === 'keep' && !invalidation) throw new Error('Only source change reviews can keep the existing version.');
            if (input.decision === 'archive' && !invalidation) throw new Error('Only source change reviews can archive the existing version.');
            if (input.decision === 'approve' && invalidation) throw new Error('Use a current extraction draft to replace this knowledge.');
            if (input.decision === 'approve')
                for (const link of links) {
                    const [source] = link.sourceId ? await tx.select().from(knowledgeSources).where(eq(knowledgeSources.id, link.sourceId)) : [];
                    if (!source || link.state !== 'current' || knowledgeHash(source.contentText) !== link.sourceHash)
                        throw new Error('Source changed; extract and review the current version.');
                }
            const payload = input.payload ?? draft.payload;
            if ((payload.kind !== draft.payload.kind && (!input.createNew || invalidation)) || !payload.name.trim() || !payload.description.trim())
                throw new Error('Invalid knowledge candidate.');
            const dataSources = await tx.select().from(knowledgeModelSources).where(eq(knowledgeModelSources.knowledgeModelId, model.id));
            if (payload.sourceConnectionId && !dataSources.some(s => s.connectionId === payload.sourceConnectionId))
                throw new Error('Data source is not linked to this knowledge model.');
            const document = projectOssieDocument(model.modelJson);
            if (input.decision === 'approve' && payload.kind === 'business_rule' && !executor)
                for (const id of payload.metricIds ?? []) {
                    const metric = document.definitions.find(d => d.id === id && d.kind === 'metric');
                    if (!metric || knowledgeHash(metric) !== input.expectedMetricRevisions?.[id]) throw new Error('Applicable metric changed; reload before reviewing.');
                }
            const targetId = input.createNew ? null : (input.targetAssetId ?? draft.targetAssetId);
            let revision: string | null = null,
                assetId = targetId;
            if (targetId) {
                if (payload.kind === 'metric') {
                    const current = document.definitions.find(d => d.id === targetId);
                    if (!current) throw new Error('Target definition not found.');
                    revision = knowledgeHash(current);
                } else {
                    const [current] = await tx
                        .select()
                        .from(rules)
                        .where(and(eq(rules.id, targetId), scope(rules, input)))
                        .for('update');
                    if (!current) throw new Error('Target business rule not found.');
                    revision = String(current.revision);
                }
                if (revision !== (input.expectedTargetRevision ?? draft.targetRevision)) throw new Error('Published knowledge changed; reload and review the difference.');
            }
            if (input.decision === 'approve' && payload.kind === 'metric' && !executor) {
                const required = await tx
                    .select()
                    .from(rules)
                    .where(and(scope(rules, input), eq(rules.status, 'active')));
                for (const rule of required.filter(
                    r =>
                        (payload.ruleIds ?? []).includes(r.id) ||
                        (r.applicationScope !== 'metrics' && (!r.payload.sourceConnectionId || r.payload.sourceConnectionId === payload.sourceConnectionId)),
                )) {
                    if (input.expectedRuleRevisions?.[rule.id] !== rule.revision) throw new Error('Referenced business rule changed; reload before reviewing.');
                }
            }
            if (input.decision === 'approve' || input.decision === 'archive') {
                if ((draft.action === 'conflict' || draft.action === 'update') && !input.targetAssetId && !input.createNew)
                    throw new Error('Choose an explicit target for conflicting knowledge.');
                if (!targetId && input.decision === 'approve') {
                    const sameName = (name: string) => name.trim().normalize('NFKC').toLocaleLowerCase() === payload.name.trim().normalize('NFKC').toLocaleLowerCase();
                    const duplicates =
                        payload.kind === 'metric'
                            ? document.definitions.some(d => d.kind === 'metric' && d.sourceConnectionId === payload.sourceConnectionId && sameName(d.name))
                            : (
                                  await tx
                                      .select()
                                      .from(rules)
                                      .where(and(scope(rules, input), eq(rules.status, 'active')))
                              ).some(r => r.payload.sourceConnectionId === payload.sourceConnectionId && sameName(r.payload.name));
                    if (duplicates) throw new Error('Knowledge with this name already exists. Select a target or rename this item.');
                }
                if (payload.kind === 'metric') {
                    if (!payload.sourceConnectionId) throw new Error('Select a data source before approving a metric.');
                    assetId ??= `metric:${randomUUID()}`;
                    const previous = document.definitions.find(d => d.id === assetId);
                    const previousContext: Exclude<NonNullable<KnowledgeDefinition['aiContext']>, string> = typeof previous?.aiContext === 'string'
                        ? { instructions: previous.aiContext }
                        : (previous?.aiContext ?? {});
                    const mapping = previous?.sourceConnectionId === payload.sourceConnectionId ? previous : undefined;
                    const next: KnowledgeDefinition = {
                        id: assetId,
                        kind: 'metric',
                        name: payload.name.trim(),
                        status: input.decision === 'archive' ? 'unverified' : input.automatic ? 'auto_published' : 'verified',
                        sourceConnectionId: payload.sourceConnectionId,
                        description: payload.description,
                        aliases: payload.aliases,
                        source: payload.source ?? mapping?.source,
                        expression: payload.expression ?? mapping?.expression,
                        filters: payload.filters ?? mapping?.filters,
                        timeDimension: payload.timeDimension ?? mapping?.timeDimension,
                        aiContext: {
                            ...previousContext,
                            synonyms: payload.aliases,
                            unit: payload.unit ?? previousContext.unit,
                            scope: payload.scope ?? previousContext.scope,
                            specificConditions: payload.specificConditions ?? previousContext.specificConditions,
                            descriptionOnly: !(payload.expression ?? mapping?.expression),
                        },
                    };
                    const definitions = document.definitions
                        .filter(d => d.id !== assetId)
                        .concat(input.decision === 'archive' && previous ? { ...previous, status: 'unverified' } : next);
                    validateKnowledgeModelDocument({ definitions }, new Set(dataSources.map(s => s.connectionId)));
                    const ossie = applyKnowledgeDefinitions(model.modelJson, definitions);
                    await tx
                        .update(knowledgeModels)
                        .set({ modelJson: ossie, modelYaml: serializeOssieDocument(ossie), updatedAt: new Date() })
                        .where(eq(knowledgeModels.id, model.id));
                    revision = knowledgeHash(projectOssieDocument(ossie).definitions.find(d => d.id === assetId));
                } else {
                    const applicationScope = payload.applicationScope ?? (payload.sourceConnectionId ? 'data_source' : 'model');
                    validateRuleScope(payload, applicationScope, document.definitions);
                    if (assetId) {
                        const [updated] = await tx
                            .update(rules)
                            .set({
                                ...(input.decision === 'approve'
                                    ? { payload, applicationScope, publicationMethod: input.automatic ? ('automatic' as const) : ('human' as const) }
                                    : {}),
                                status: input.decision === 'archive' ? 'archived' : 'active',
                                revision: sql`${rules.revision} + 1`,
                                updatedBy: input.userId,
                                updatedAt: new Date(),
                            })
                            .where(and(eq(rules.id, assetId), scope(rules, input)))
                            .returning();
                        revision = String(updated.revision);
                    } else {
                        const [created] = await tx
                            .insert(rules)
                            .values({
                                ...inputScope(input),
                                payload,
                                applicationScope,
                                publicationMethod: input.automatic ? 'automatic' : 'human',
                                updatedBy: input.automatic ? null : input.userId,
                            })
                            .returning();
                        assetId = created.id;
                        revision = String(created.revision);
                    }
                }
                if (input.decision === 'approve') {
                    if (payload.kind === 'business_rule') {
                        await tx.delete(metricRules).where(and(eq(metricRules.knowledgeModelId, model.id), eq(metricRules.ruleId, assetId!)));
                        for (const metricId of [...new Set(payload.metricIds ?? [])]) await tx.insert(metricRules).values({ ...inputScope(input), metricId, ruleId: assetId! });
                    } else {
                        const ruleIds = new Set(payload.ruleIds ?? []);
                        for (const candidateId of payload.ruleCandidateIds ?? []) {
                            const [dependency] = await tx
                                .select()
                                .from(candidates)
                                .where(and(scope(candidates, input), eq(candidates.id, candidateId)));
                            if (dependency?.status !== 'approved' || dependency.payload.kind !== 'business_rule' || !dependency.targetAssetId)
                                throw new Error('Review required shared rules together with this metric.');
                            ruleIds.add(dependency.targetAssetId);
                        }
                        if (payload.ruleIds !== undefined || payload.ruleCandidateIds !== undefined) {
                            await replaceMetricRules(
                                tx,
                                input,
                                assetId!,
                                [...ruleIds],
                                document.definitions.concat({
                                    id: assetId!,
                                    kind: 'metric',
                                    sourceConnectionId: payload.sourceConnectionId!,
                                    name: payload.name,
                                    status: 'verified',
                                }),
                            );
                        }
                    }
                }
                const assetType = payload.kind === 'metric' ? 'definition' : 'business_rule';
                if (input.decision === 'approve') {
                    await tx
                        .update(candidates)
                        .set({ status: 'superseded', updatedAt: new Date() })
                        .where(
                            and(
                                scope(candidates, input),
                                eq(candidates.targetAssetId, assetId!),
                                eq(candidates.status, 'pending'),
                                inArray(candidates.action, ['source_changed', 'remove']),
                            ),
                        );
                    await tx
                        .update(evidence)
                        .set({ assetId: null, assetType: null })
                        .where(and(scope(evidence, input), eq(evidence.assetType, assetType), eq(evidence.assetId, assetId!)));
                    await tx.update(evidence).set({ assetId, assetType }).where(eq(evidence.candidateId, draft.id));
                    await tx
                        .delete(knowledgeAssetSources)
                        .where(
                            and(eq(knowledgeAssetSources.knowledgeModelId, model.id), eq(knowledgeAssetSources.assetType, assetType), eq(knowledgeAssetSources.assetId, assetId!)),
                        );
                    for (const sourceId of new Set(links.flatMap(e => (e.sourceId ? [e.sourceId] : []))))
                        await tx
                            .insert(knowledgeAssetSources)
                            .values({ knowledgeModelId: model.id, knowledgeSourceId: sourceId, assetType, assetId: assetId!, relationType: 'generated', createdBy: input.userId })
                            .onConflictDoNothing();
                }
            }
            await tx
                .update(candidates)
                .set({
                    status: input.decision === 'reject' ? 'rejected' : 'approved',
                    payload,
                    payloadHash: knowledgeHash(payload),
                    itemKey: knowledgeItemKey(payload),
                    targetAssetId: assetId,
                    targetRevision: revision,
                    reviewedBy: input.automatic ? null : input.userId,
                    reviewedAt: new Date(),
                    reviewNote: input.note ?? input.decision,
                    updatedAt: new Date(),
                })
                .where(eq(candidates.id, draft.id));
            await tx.insert(historyEvents).values({
                ...inputScope(input),
                candidateId: draft.id,
                kind: input.decision === 'reject' ? 'rejected' : input.automatic ? 'automatic' : 'human',
                assetId,
                assetRevision: revision,
                publicationEpoch: draft.publicationEpoch,
                actorId: input.automatic ? null : input.userId,
                payload,
                reason: input.note ?? input.decision,
                evidence: links.map(e => ({ quote: e.quote, sourceId: e.originalSourceId, sourceHash: e.sourceHash, sourceTitle: e.sourceTitle, sourceUrl: e.sourceUrl })),
            });
            return { id: draft.id, assetId };
        };
        return executor ? publish(executor) : this.db.transaction(tx => publish(tx as unknown as PostgresDBClient));
    }
    async reviewBundle(
        input: ModelScope & {
            userId: string;
            items: Array<{
                candidateId: string;
                payload: ExtractedKnowledge;
                targetAssetId?: string;
                expectedTargetRevision?: string;
                createNew?: boolean;
                expectedRuleRevisions?: Record<string, number>;
                expectedMetricRevisions?: Record<string, string>;
            }>;
        },
    ) {
        return this.db.transaction(async transaction => {
            const tx = transaction as unknown as PostgresDBClient;
            const [model] = await tx
                .select()
                .from(knowledgeModels)
                .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)))
                .for('update');
            if (!model) throw new Error('Knowledge model not found.');
            const inputs = new Map(input.items.map(item => [item.candidateId, item]));
            if (inputs.size !== input.items.length) throw new Error('Duplicate bundle item.');
            const drafts = await tx
                .select()
                .from(candidates)
                .where(and(scope(candidates, input), inArray(candidates.id, [...inputs.keys()])));
            if (drafts.length !== inputs.size || drafts.some(d => d.status !== 'pending' || ['source_changed', 'remove'].includes(d.action)))
                throw new Error('Review bundle changed.');
            for (const item of input.items) {
                const draft = drafts.find(d => d.id === item.candidateId)!;
                if (draft.payload.kind !== item.payload.kind) throw new Error('Keep classification changes separate from bundled review.');
                // Conditions may be retained locally only through an explicit edit
                // that removes the dependency; the original proposal is shown in UI.
                for (const dependencyId of item.payload.ruleCandidateIds ?? []) {
                    if (inputs.has(dependencyId)) continue;
                    const [dependency] = await tx
                        .select()
                        .from(candidates)
                        .where(and(scope(candidates, input), eq(candidates.id, dependencyId)));
                    if (dependency?.status !== 'approved' || !dependency.targetAssetId) throw new Error('Review required shared rules together.');
                }
            }
            const definitionsBeforeReview = projectOssieDocument(model.modelJson).definitions;
            for (const item of input.items.filter(i => i.payload.kind === 'business_rule'))
                for (const id of item.payload.metricIds ?? []) {
                    const metric = definitionsBeforeReview.find(d => d.id === id && d.kind === 'metric');
                    if (!metric || knowledgeHash(metric) !== item.expectedMetricRevisions?.[id]) throw new Error('Applicable metric changed; reload before reviewing.');
                }
            const existingRules = await tx
                .select()
                .from(rules)
                .where(and(scope(rules, input), eq(rules.status, 'active')));
            for (const item of input.items.filter(i => i.payload.kind === 'metric'))
                for (const rule of existingRules.filter(
                    r =>
                        (item.payload.ruleIds ?? []).includes(r.id) ||
                        (r.applicationScope !== 'metrics' && (!r.payload.sourceConnectionId || r.payload.sourceConnectionId === item.payload.sourceConnectionId)),
                )) {
                    if (item.expectedRuleRevisions?.[rule.id] !== rule.revision) throw new Error('Referenced business rule changed; reload before reviewing.');
                }
            const published = new Map<string, string>();
            // All these writes share the outer model lock and transaction. No
            // intermediate metric lacking its constraints can become visible.
            for (const item of input.items.filter(i => i.payload.kind === 'metric')) {
                const result = await this.review(
                    { ...inputScope(input), userId: input.userId, ...item, payload: { ...item.payload, ruleCandidateIds: [] }, decision: 'approve' },
                    tx,
                );
                published.set(item.candidateId, result.assetId!);
            }
            for (const item of input.items.filter(i => i.payload.kind === 'business_rule')) {
                const names = new Set(item.payload.applicableMetricNames ?? []);
                const metricIds = [
                    ...new Set([
                        ...(item.payload.metricIds ?? []),
                        ...input.items.filter(m => m.payload.kind === 'metric' && names.has(m.payload.name)).map(m => published.get(m.candidateId)!),
                    ]),
                ];
                const result = await this.review({ ...inputScope(input), userId: input.userId, ...item, payload: { ...item.payload, metricIds }, decision: 'approve' }, tx);
                published.set(item.candidateId, result.assetId!);
            }
            for (const item of input.items.filter(i => i.payload.kind === 'metric')) {
                const [updatedModel] = await tx.select().from(knowledgeModels).where(eq(knowledgeModels.id, model.id));
                const ruleIds = new Set(item.payload.ruleIds ?? []);
                for (const id of item.payload.ruleCandidateIds ?? []) {
                    const [draft] = await tx
                        .select()
                        .from(candidates)
                        .where(and(scope(candidates, input), eq(candidates.id, id)));
                    if (draft?.status !== 'approved' || !draft.targetAssetId) throw new Error('Rule dependency was not published.');
                    ruleIds.add(draft.targetAssetId);
                }
                await replaceMetricRules(tx, input, published.get(item.candidateId)!, [...ruleIds], projectOssieDocument(updatedModel.modelJson).definitions);
                const payload = { ...item.payload, ruleIds: [...ruleIds], ruleCandidateIds: [] };
                await tx
                    .update(candidates)
                    .set({ payload, payloadHash: knowledgeHash(payload) })
                    .where(eq(candidates.id, item.candidateId));
            }
            return { published: [...published].map(([candidateId, assetId]) => ({ candidateId, assetId })) };
        });
    }
    async updateMetricRules(
        input: ModelScope & {
            userId?: string;
            metricId: string;
            expectedRevision: string;
            ruleIds: string[];
            expectedRuleRevisions: Record<string, number>;
            expectedReferenceIds: string[];
        },
    ) {
        return this.db.transaction(async tx => {
            const [model] = await tx
                .select()
                .from(knowledgeModels)
                .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)))
                .for('update');
            if (!model) throw new Error('Knowledge model not found.');
            const definitions = projectOssieDocument(model.modelJson).definitions;
            const metric = definitions.find(d => d.id === input.metricId && d.kind === 'metric');
            if (!metric || knowledgeHash(metric) !== input.expectedRevision) throw new Error('Metric changed; reload before editing references.');
            const refs = await tx
                .select()
                .from(metricRules)
                .where(and(eq(metricRules.knowledgeModelId, model.id), eq(metricRules.metricId, metric.id)));
            if (knowledgeHash(refs.map(r => r.ruleId).sort()) !== knowledgeHash([...input.expectedReferenceIds].sort()))
                throw new Error('Metric references changed; reload before editing.');
            const current = await tx.select().from(rules).where(scope(rules, input));
            for (const id of new Set([...input.ruleIds, ...refs.map(r => r.ruleId)]))
                if (current.find(r => r.id === id)?.revision !== input.expectedRuleRevisions[id]) throw new Error('Business rule changed; reload before editing references.');
            await replaceMetricRules(tx, input, metric.id, input.ruleIds, definitions);
            const changed = [...new Set([...refs.map(r => r.ruleId), ...input.ruleIds])].filter(id => refs.some(r => r.ruleId === id) !== input.ruleIds.includes(id));
            if (changed.length)
                await tx
                    .update(rules)
                    .set({ revision: sql`${rules.revision} + 1`, updatedAt: new Date() })
                    .where(and(scope(rules, input), inArray(rules.id, changed)));
            if (changed.length && metric.status === 'auto_published') {
                const updated = { ...metric, status: 'verified' as const };
                const ossie = applyKnowledgeDefinitions(
                    model.modelJson,
                    definitions.map(d => (d.id === metric.id ? updated : d)),
                );
                await tx
                    .update(knowledgeModels)
                    .set({ modelJson: ossie, modelYaml: serializeOssieDocument(ossie) })
                    .where(eq(knowledgeModels.id, model.id));
                const links = await tx
                    .select()
                    .from(evidence)
                    .where(and(scope(evidence, input), eq(evidence.assetId, metric.id)));
                await tx.insert(historyEvents).values({
                    ...inputScope(input),
                    kind: 'edited',
                    assetId: metric.id,
                    assetRevision: knowledgeHash(updated),
                    actorId: input.userId ?? null,
                    payload: {
                        kind: 'metric',
                        name: updated.name,
                        description: updated.description ?? '',
                        aliases: updated.aliases ?? [],
                        sourceConnectionId: updated.sourceConnectionId,
                        source: updated.source,
                        expression: updated.expression,
                        filters: updated.filters,
                        timeDimension: updated.timeDimension,
                        ruleIds: input.ruleIds,
                    },
                    evidence: links.map(e => ({ quote: e.quote, sourceId: e.originalSourceId, sourceHash: e.sourceHash, sourceTitle: e.sourceTitle, sourceUrl: e.sourceUrl })),
                });
            }
            return { ok: true };
        });
    }
    async updateRule(
        input: ModelScope & {
            id: string;
            expectedRevision: number;
            userId: string;
            payload?: ExtractedKnowledge;
            archived?: boolean;
            expectedMetricRevisions?: Record<string, string>;
        },
    ) {
        return this.db.transaction(async tx => {
            const [model] = await tx
                .select()
                .from(knowledgeModels)
                .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)))
                .for('update');
            if (!model) throw new Error('Knowledge model not found.');
            const [current] = await tx
                .select()
                .from(rules)
                .where(and(scope(rules, input), eq(rules.id, input.id)))
                .for('update');
            if (!current || current.revision !== input.expectedRevision) throw new Error('Business rule changed; reload before editing.');
            const payload = input.payload ?? current.payload;
            if (payload.kind !== 'business_rule') throw new Error('Invalid business rule.');
            const dataSources = await tx.select().from(knowledgeModelSources).where(eq(knowledgeModelSources.knowledgeModelId, model.id));
            if (payload.sourceConnectionId && !dataSources.some(s => s.connectionId === payload.sourceConnectionId)) throw new Error('Data source is not linked to this model.');
            if (input.payload)
                for (const id of payload.metricIds ?? []) {
                    const metric = projectOssieDocument(model.modelJson).definitions.find(d => d.id === id && d.kind === 'metric');
                    if (!metric || knowledgeHash(metric) !== input.expectedMetricRevisions?.[id]) throw new Error('Applicable metric changed; reload before editing.');
                }
            const applicationScope = payload.applicationScope ?? current.applicationScope;
            validateRuleScope(payload, applicationScope, projectOssieDocument(model.modelJson).definitions);
            const [updated] = await tx
                .update(rules)
                .set({
                    ...(input.payload ? { payload, applicationScope, publicationMethod: 'human' as const } : {}),
                    ...(input.archived === undefined ? {} : { status: input.archived ? ('archived' as const) : ('active' as const) }),
                    revision: current.revision + 1,
                    updatedBy: input.userId,
                    updatedAt: new Date(),
                })
                .where(eq(rules.id, current.id))
                .returning();
            if (input.payload) {
                await tx.delete(metricRules).where(and(eq(metricRules.knowledgeModelId, model.id), eq(metricRules.ruleId, current.id)));
                for (const metricId of [...new Set(payload.metricIds ?? [])]) await tx.insert(metricRules).values({ ...inputScope(input), metricId, ruleId: current.id });
            }
            const links = await tx
                .select()
                .from(evidence)
                .where(and(scope(evidence, input), eq(evidence.assetId, updated.id)));
            await tx.insert(historyEvents).values({
                ...inputScope(input),
                kind: 'edited',
                assetId: updated.id,
                assetRevision: String(updated.revision),
                actorId: input.userId,
                payload,
                evidence: links.map(e => ({ quote: e.quote, sourceId: e.originalSourceId, sourceHash: e.sourceHash, sourceTitle: e.sourceTitle, sourceUrl: e.sourceUrl })),
            });
            return updated;
        });
    }
}
function inputScope(input: ModelScope) {
    return { organizationId: input.organizationId, knowledgeModelId: input.knowledgeModelId };
}

function validateRuleScope(payload: ExtractedKnowledge, applicationScope: 'model' | 'data_source' | 'metrics', definitions: KnowledgeDefinition[]) {
    if (applicationScope === 'model' && payload.sourceConnectionId) throw new Error('A model-wide rule cannot be restricted to one data source.');
    if (applicationScope === 'data_source' && !payload.sourceConnectionId) throw new Error('Select a data source for this rule.');
    if (applicationScope === 'metrics' && !payload.metricIds?.length) throw new Error('Select at least one applicable metric.');
    for (const id of payload.metricIds ?? []) {
        const metric = definitions.find(d => d.id === id && d.kind === 'metric');
        if (!metric || (payload.sourceConnectionId && metric.sourceConnectionId !== payload.sourceConnectionId)) throw new Error('Metric is outside this rule scope.');
    }
}
async function replaceMetricRules(db: Executor, input: ModelScope, metricId: string, ruleIds: string[], definitions: KnowledgeDefinition[]) {
    const metric = definitions.find(d => d.id === metricId && d.kind === 'metric');
    if (!metric) throw new Error('Metric not found.');
    const selected = ruleIds.length
        ? await db
              .select()
              .from(rules)
              .where(and(scope(rules, input), inArray(rules.id, ruleIds)))
        : [];
    const existing = await db
        .select()
        .from(metricRules)
        .where(and(eq(metricRules.knowledgeModelId, input.knowledgeModelId), eq(metricRules.metricId, metricId)));
    if (
        selected.length !== new Set(ruleIds).size ||
        selected.some(
            r =>
                (r.status !== 'active' && !existing.some(ref => ref.ruleId === r.id)) ||
                (r.payload.sourceConnectionId && r.payload.sourceConnectionId !== metric.sourceConnectionId),
        )
    )
        throw new Error('Business rule is unavailable for this metric.');
    await db.delete(metricRules).where(and(eq(metricRules.knowledgeModelId, input.knowledgeModelId), eq(metricRules.metricId, metricId)));
    for (const ruleId of new Set(ruleIds)) await db.insert(metricRules).values({ ...inputScope(input), metricId, ruleId });
}
