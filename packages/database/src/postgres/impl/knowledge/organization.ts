import { randomUUID } from 'node:crypto';
import type { PostgresDBClient } from '@dory/shared';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';
import { and, asc, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm';

import { knowledgeConnectorItems, knowledgeConnectors, knowledgeModels, knowledgeSources } from '../../schemas/knowledge';
import {
    knowledgeCandidates as candidates,
    knowledgeEvidence as evidence,
    knowledgeProcessingHistory as historyEvents,
    knowledgeExtractionJobs as jobs,
    knowledgePublicationJobs as publicationJobs,
    knowledgeOrganizationJobs as queue,
    knowledgeBusinessRules as rules,
    type ExtractedCandidate,
    type ExtractedKnowledge,
    type ExtractionEvidenceInput,
} from '../../schemas/knowledge-extraction';
import { copyDraftEvidence, knowledgeHash, knowledgeItemKey, type ModelScope } from './extraction';
import { projectOssieDocument } from './ossie';

export type OrganizationItem = {
    id: string;
    payload: ExtractedKnowledge;
    evidence: ExtractionEvidenceInput[];
    candidateId?: string;
    publicationEpoch?: number | null;
    manualOnly?: boolean;
    targetAssetId?: string | null;
    disposition?: 'knowledge' | 'background';
    reason?: string;
};
export type OrganizedItem = { payload: ExtractedKnowledge; inputIds: string[]; sharedRuleKeys?: string[]; disposition?: 'knowledge' | 'background'; reason?: string };
type Executor = Pick<PostgresDBClient, 'select' | 'insert' | 'update' | 'delete'>;
export async function enqueueOrganization(db: Executor, input: ModelScope) {
    await db
        .insert(queue)
        .values(input)
        .onConflictDoUpdate({
            target: queue.knowledgeModelId,
            set: {
                generation: sql`${queue.generation} + 1`,
                status: 'queued',
                attempts: 0,
                leaseToken: null,
                error: null,
                availableAt: sql`clock_timestamp()`,
                updatedAt: new Date(),
            },
        });
}
export class KnowledgeOrganizationStore {
    constructor(private readonly db: PostgresDBClient) {}
    async stage(id: string, token: string, output: ExtractedCandidate[]) {
        await this.db.transaction(async tx => {
            const [initial] = await tx.select().from(jobs).where(eq(jobs.id, id));
            if (!initial) throw new Error('Extraction job not found.');
            const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, initial.connectorId)).for('update');
            await tx.select().from(knowledgeModels).where(eq(knowledgeModels.id, initial.knowledgeModelId)).for('update');
            const [job] = await tx
                .select()
                .from(jobs)
                .where(and(eq(jobs.id, id), eq(jobs.leaseToken, token), eq(jobs.status, 'running'), gt(jobs.leaseExpiresAt, sql`clock_timestamp()`)))
                .for('update');
            const [source] = job?.sourceId ? await tx.select().from(knowledgeSources).where(eq(knowledgeSources.id, job.sourceId)) : [];
            if (!job || !connector?.autoExtract || connector.status === 'disabled' || !source || knowledgeHash(source.contentText) !== job.sourceHash)
                throw new Error('Extraction source or lease changed.');
            if (output.some(item => !item.quotes.length || item.quotes.some(q => !q.trim() || !source.contentText.includes(q))))
                throw new Error('Extraction evidence does not match source.');
            await tx.update(jobs).set({ stagedOutput: output, status: 'completed', leaseToken: null, error: null, updatedAt: new Date() }).where(eq(jobs.id, id));
            await enqueueOrganization(tx, { organizationId: job.organizationId, knowledgeModelId: job.knowledgeModelId });
        });
    }
    async request(input: ModelScope) {
        const [model] = await this.db
            .select()
            .from(knowledgeModels)
            .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
        if (!model) throw new Error('Knowledge model not found.');
        await enqueueOrganization(this.db, input);
    }
    async claim() {
        return this.db.transaction(async tx => {
            await tx
                .update(queue)
                .set({ status: 'failed', leaseToken: null, error: 'Organization lease expired after five attempts.' })
                .where(and(eq(queue.status, 'running'), lte(queue.leaseExpiresAt, sql`clock_timestamp()`), sql`${queue.attempts} >= 5`));
            await tx
                .update(queue)
                .set({ status: 'queued', leaseToken: null })
                .where(and(eq(queue.status, 'running'), lte(queue.leaseExpiresAt, sql`clock_timestamp()`), lt(queue.attempts, 5)));
            const [job] = await tx
                .select()
                .from(queue)
                .where(and(eq(queue.status, 'queued'), lte(queue.availableAt, sql`clock_timestamp()`), lt(queue.attempts, 5)))
                .orderBy(asc(queue.availableAt))
                .limit(1)
                .for('update', { skipLocked: true });
            if (!job) return null;
            const [claimed] = await tx
                .update(queue)
                .set({ status: 'running', attempts: job.attempts + 1, leaseToken: randomUUID(), leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'` })
                .where(eq(queue.id, job.id))
                .returning();
            return claimed;
        });
    }
    async heartbeat(id: string, token: string) {
        const [row] = await this.db
            .update(queue)
            .set({ leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'` })
            .where(and(eq(queue.id, id), eq(queue.leaseToken, token), eq(queue.status, 'running'), gt(queue.leaseExpiresAt, sql`clock_timestamp()`)))
            .returning();
        if (!row) throw new Error('Organization lease lost.');
    }
    async fail(id: string, token: string, error: string, retry: boolean, blocked: boolean) {
        const [job] = await this.db.select().from(queue).where(eq(queue.id, id));
        if (!job) return;
        await this.db
            .update(queue)
            .set({
                status: blocked ? 'blocked' : retry && job.attempts < 5 ? 'queued' : 'failed',
                error: error.slice(0, 1000),
                leaseToken: null,
                availableAt: sql`clock_timestamp() + ${30_000 * 2 ** (job.attempts - 1)} * interval '1 millisecond'`,
            })
            .where(and(eq(queue.id, id), eq(queue.leaseToken, token), eq(queue.status, 'running')));
    }
    async snapshot(input: ModelScope, db: Executor = this.db) {
        const [model] = await db
            .select()
            .from(knowledgeModels)
            .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
        if (!model) throw new Error('Knowledge model not found.');
        const pending = await db
            .select()
            .from(candidates)
            .where(and(eq(candidates.knowledgeModelId, model.id), eq(candidates.status, 'pending')))
            .orderBy(asc(candidates.id));
        const history = await db
            .select()
            .from(candidates)
            .where(and(eq(candidates.knowledgeModelId, model.id), inArray(candidates.status, ['rejected', 'approved', 'background'])))
            .orderBy(asc(candidates.id));
        const allEvidence = await db.select().from(evidence).where(eq(evidence.knowledgeModelId, model.id)).orderBy(asc(evidence.id));
        const staged = await db
            .select({ job: jobs, source: knowledgeSources, sourceUrl: knowledgeConnectorItems.sourceUrl, autoExtract: knowledgeConnectors.autoExtract })
            .from(jobs)
            .innerJoin(knowledgeSources, eq(jobs.sourceId, knowledgeSources.id))
            .innerJoin(knowledgeConnectors, eq(jobs.connectorId, knowledgeConnectors.id))
            .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
            .where(and(eq(jobs.knowledgeModelId, model.id), eq(jobs.status, 'completed')))
            .orderBy(asc(jobs.id));
        const officialRules = await db.select().from(rules).where(eq(rules.knowledgeModelId, model.id)).orderBy(asc(rules.id));
        const items: OrganizationItem[] = [];
        for (const c of pending.filter(c => c.action !== 'remove' && c.action !== 'source_changed')) {
            const links = allEvidence.filter(e => e.candidateId === c.id && e.state === 'current');
            if (links.length)
                items.push({
                    id: c.id,
                    candidateId: c.id,
                    publicationEpoch: c.publicationEpoch,
                    manualOnly: Boolean(c.manualOnly),
                    targetAssetId: c.targetAssetId,
                    payload: c.payload,
                    evidence: links.map(e => ({
                        quote: e.quote,
                        sourceId: e.originalSourceId,
                        sourceHash: e.sourceHash,
                        sourceTitle: knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl }),
                        sourceUrl: e.sourceUrl,
                    })),
                });
        }
        for (const row of staged) {
            if (!row.autoExtract || knowledgeHash(row.source.contentText) !== row.job.sourceHash) continue;
            for (const [index, item] of (row.job.stagedOutput ?? []).entries()) {
                const reviewed = history.some(
                    c =>
                        (c.status === 'rejected' || c.status === 'background' ? c.itemKey === knowledgeItemKey(item.payload) : c.payloadHash === knowledgeHash(item.payload)) &&
                        allEvidence.some(e => e.candidateId === c.id && e.originalSourceId === row.source.id && e.sourceHash === row.job.sourceHash),
                );
                if (!reviewed)
                    items.push({
                        id: `${row.job.id}:${index}`,
                        publicationEpoch: row.job.publicationEpoch,
                        disposition: item.disposition,
                        reason: item.reason,
                        payload: item.payload,
                        evidence: item.quotes.map(quote => ({
                            quote,
                            sourceId: row.source.id,
                            sourceHash: row.job.sourceHash,
                            sourceTitle: knowledgeSourceDisplayName({ fileName: row.source.fileName, sourceUrl: row.sourceUrl }),
                            sourceUrl: row.sourceUrl,
                        })),
                    });
            }
        }
        const definitions = projectOssieDocument(model.modelJson).definitions;
        return { items, definitions, rules: officialRules, fingerprint: knowledgeHash({ model: model.modelJson, pending, history, allEvidence, staged, officialRules }) };
    }
    async complete(id: string, token: string, fingerprint: string, output: OrganizedItem[]) {
        return this.db.transaction(async tx => {
            const [initial] = await tx.select().from(queue).where(eq(queue.id, id));
            if (!initial) throw new Error('Organization job not found.');
            await tx.select().from(knowledgeModels).where(eq(knowledgeModels.id, initial.knowledgeModelId)).for('update');
            const [job] = await tx
                .select()
                .from(queue)
                .where(and(eq(queue.id, id), eq(queue.leaseToken, token), eq(queue.status, 'running'), gt(queue.leaseExpiresAt, sql`clock_timestamp()`)))
                .for('update');
            if (!job) throw new Error('Organization lease lost.');
            const snapshot = await this.snapshot(job, tx);
            if (snapshot.fingerprint !== fingerprint) {
                await enqueueOrganization(tx, { organizationId: job.organizationId, knowledgeModelId: job.knowledgeModelId });
                return false;
            }
            const inputMap = new Map(snapshot.items.map(item => [item.id, item]));
            // Background decisions preserve the exact input payload, never a model-written
            // replacement. One record per input; inputs retained as knowledge take precedence.
            const knowledgeRefs = new Set(output.filter(item => item.disposition !== 'background').flatMap(item => item.inputIds));
            const backgroundRefs = new Set<string>();
            output = output.flatMap(item =>
                item.disposition !== 'background'
                    ? [item]
                    : item.inputIds.flatMap(ref => {
                          const original = inputMap.get(ref);
                          if (!original) throw new Error('Organization evidence references are invalid.');
                          if (knowledgeRefs.has(ref) || backgroundRefs.has(ref)) return [];
                          backgroundRefs.add(ref);
                          return [{ ...item, payload: original.payload, inputIds: [ref] }];
                      }),
            );
            if (output.some(o => !o.inputIds.length || o.inputIds.some(ref => !inputMap.has(ref)))) throw new Error('Organization evidence references are invalid.');
            // Omission is forbidden: every input must survive either as a metric
            // condition or shared rule. Ambiguous facts stay in their original item.
            if (snapshot.items.some(item => !output.some(o => o.inputIds.includes(item.id)))) throw new Error('Organization dropped source material.');
            const oldIds = snapshot.items.flatMap(item => (item.candidateId ? [item.candidateId] : []));
            if (oldIds.length)
                await tx
                    .update(candidates)
                    .set({ status: 'superseded', updatedAt: new Date() })
                    .where(and(inArray(candidates.id, oldIds), eq(candidates.status, 'pending')));
            const model = (await tx.select().from(knowledgeModels).where(eq(knowledgeModels.id, job.knowledgeModelId)))[0];
            const created: Array<{ id: string; item: OrganizedItem }> = [];
            for (const item of output) {
                const inputs = item.inputIds.map(ref => inputMap.get(ref)!);
                const background = item.disposition === 'background';
                if (background && (!item.reason || inputs.some(i => i.manualOnly || i.targetAssetId))) throw new Error('Invalid background classification.');
                const epoch =
                    inputs.every(i => i.publicationEpoch === model.publicationEpoch && !i.manualOnly) && model.publicationMode === 'automatic' ? model.publicationEpoch : null;
                const key = knowledgeItemKey(item.payload);
                const matches =
                    item.payload.kind === 'metric'
                        ? snapshot.definitions
                              .filter(
                                  d =>
                                      d.kind === 'metric' &&
                                      knowledgeItemKey({ ...item.payload, name: d.name }) === key &&
                                      (!item.payload.sourceConnectionId || d.sourceConnectionId === item.payload.sourceConnectionId),
                              )
                              .map(d => ({ id: d.id, revision: knowledgeHash(d) }))
                        : snapshot.rules.filter(r => r.status === 'active' && knowledgeItemKey(r.payload) === key).map(r => ({ id: r.id, revision: String(r.revision) }));
                const conflicting = output.some(o => o !== item && knowledgeItemKey(o.payload) === key && knowledgeHash(o.payload) !== knowledgeHash(item.payload));
                const [draft] = await tx
                    .insert(candidates)
                    .values({
                        organizationId: job.organizationId,
                        knowledgeModelId: job.knowledgeModelId,
                        itemKey: key,
                        payloadHash: knowledgeHash(item.payload),
                        payload: item.payload,
                        action: conflicting || matches.length ? 'conflict' : 'add',
                        status: background ? 'background' : 'pending',
                        publicationEpoch: epoch,
                        manualOnly: inputs.some(i => i.manualOnly) ? 1 : 0,
                        classificationReason: item.reason ?? null,
                        targetAssetId: matches.length === 1 ? matches[0].id : null,
                        targetRevision: matches.length === 1 ? matches[0].revision : null,
                    })
                    .returning();
                created.push({ id: draft.id, item });
                const links = item.inputIds.flatMap(ref => inputMap.get(ref)!.evidence);
                for (const link of links) {
                    const [source] = await tx.select().from(knowledgeSources).where(eq(knowledgeSources.id, link.sourceId));
                    if (!source || knowledgeHash(source.contentText) !== link.sourceHash || !source.contentText.includes(link.quote))
                        throw new Error('Organization source changed.');
                }
                await copyDraftEvidence(
                    tx,
                    draft.id,
                    links.map(link => ({
                        ...link,
                        id: '',
                        organizationId: job.organizationId,
                        knowledgeModelId: job.knowledgeModelId,
                        candidateId: draft.id,
                        originalSourceId: link.sourceId,
                        state: 'current' as const,
                        assetType: null,
                        assetId: null,
                        createdAt: new Date(),
                    })),
                );
            }
            for (const { id: candidateId, item } of created) {
                if (item.disposition === 'background') {
                    await tx.insert(historyEvents).values({
                        organizationId: job.organizationId,
                        knowledgeModelId: job.knowledgeModelId,
                        candidateId,
                        kind: 'background',
                        payload: { ...item.payload, classificationVersion: 5, inputIds: item.inputIds },
                        reason: item.reason,
                        evidence: item.inputIds.flatMap(ref => inputMap.get(ref)!.evidence),
                    });
                } else {
                    const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
                    if (candidate.publicationEpoch !== null)
                        await tx
                            .insert(publicationJobs)
                            .values({ organizationId: job.organizationId, knowledgeModelId: job.knowledgeModelId, candidateId, publicationEpoch: candidate.publicationEpoch })
                            .onConflictDoNothing();
                }
            }
            for (const c of created.filter(c => c.item.payload.kind === 'metric' && c.item.disposition !== 'background')) {
                const ruleCandidateIds = (c.item.sharedRuleKeys ?? []).map(key => {
                    const rule = created.find(r => r.item.payload.kind === 'business_rule' && knowledgeHash(r.item.payload) === key);
                    if (!rule) throw new Error('Shared rule dependency is missing.');
                    return rule.id;
                });
                {
                    const payload = { ...c.item.payload, ruleCandidateIds };
                    await tx
                        .update(candidates)
                        .set({ payload, payloadHash: knowledgeHash(payload) })
                        .where(eq(candidates.id, c.id));
                }
            }
            // Clear consumed outputs only after a complete successful model pass.
            await tx.update(jobs).set({ stagedOutput: null }).where(eq(jobs.knowledgeModelId, job.knowledgeModelId));
            await tx
                .update(queue)
                .set({ status: 'completed', leaseToken: null, error: null, lastCompletedAt: sql`clock_timestamp()`, updatedAt: new Date() })
                .where(eq(queue.id, job.id));
            return true;
        });
    }
}
