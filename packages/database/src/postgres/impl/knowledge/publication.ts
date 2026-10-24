import { randomUUID } from 'node:crypto';
import type { PostgresDBClient } from '@dory/shared';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';
import { and, asc, desc, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm';

import { connections } from '../../schemas/connections';
import {
    isPublishedDefinition,
    knowledgeAssetSources,
    knowledgeConnectorItems,
    knowledgeConnectors,
    knowledgeModels,
    knowledgeModelSources,
    knowledgeSources,
    knowledgeVerifiedQueries,
} from '../../schemas/knowledge';
import {
    knowledgeCandidates as candidates,
    knowledgeEvidence as evidence,
    knowledgeProcessingHistory as history,
    knowledgePublicationJobs as jobs,
    knowledgeMetricRules as references,
    knowledgeBusinessRules as rules,
    type PublicationMode,
} from '../../schemas/knowledge-extraction';
import { copyDraftEvidence, knowledgeHash, knowledgeItemKey, type KnowledgeExtractionStore, type ModelScope } from './extraction';
import { applyKnowledgeDefinitions, projectOssieDocument, serializeOssieDocument } from './ossie';

type Tx = Pick<PostgresDBClient, 'select' | 'insert' | 'update' | 'delete'>;
const modelWhere = (s: ModelScope) => and(eq(knowledgeModels.id, s.knowledgeModelId), eq(knowledgeModels.organizationId, s.organizationId));
const scoped = (s: ModelScope) => and(eq(candidates.knowledgeModelId, s.knowledgeModelId), eq(candidates.organizationId, s.organizationId));

export class KnowledgePublicationStore {
    constructor(
        private readonly db: PostgresDBClient,
        private readonly extraction: KnowledgeExtractionStore,
    ) {}
    async policy(input: ModelScope) {
        const model = await this.extraction.assertModel(input);
        return { mode: model.publicationMode, version: model.publicationEpoch };
    }
    async setPolicy(input: ModelScope & { mode: PublicationMode; expectedVersion: number }) {
        return this.db.transaction(async tx => {
            const [model] = await tx.select().from(knowledgeModels).where(modelWhere(input)).for('update');
            if (!model) throw new Error('Knowledge model not found.');
            if (model.publicationEpoch !== input.expectedVersion) throw new Error('Publication settings changed; reload before saving.');
            if (model.publicationMode === input.mode) return { mode: model.publicationMode, version: model.publicationEpoch };
            await tx
                .update(knowledgeModels)
                .set({ publicationMode: input.mode, publicationEpoch: model.publicationEpoch + 1 })
                .where(modelWhere(input));
            await tx
                .update(jobs)
                .set({ status: 'cancelled', leaseToken: null })
                .where(and(eq(jobs.knowledgeModelId, model.id), inArray(jobs.status, ['queued', 'running', 'failed'])));
            return { mode: input.mode, version: model.publicationEpoch + 1 };
        });
    }
    async claim() {
        return this.db.transaction(async tx => {
            await tx
                .update(jobs)
                .set({ status: 'failed', leaseToken: null, error: 'Publication lease expired after five attempts.' })
                .where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, sql`clock_timestamp()`), sql`${jobs.attempts} >= 5`));
            await tx
                .update(jobs)
                .set({ status: 'queued', leaseToken: null })
                .where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, sql`clock_timestamp()`), lt(jobs.attempts, 5)));
            const [job] = await tx
                .select()
                .from(jobs)
                .where(and(eq(jobs.status, 'queued'), lte(jobs.availableAt, sql`clock_timestamp()`), lt(jobs.attempts, 5)))
                .orderBy(asc(jobs.availableAt))
                .limit(1)
                .for('update', { skipLocked: true });
            if (!job) return null;
            const [claimed] = await tx
                .update(jobs)
                .set({ status: 'running', attempts: job.attempts + 1, leaseToken: randomUUID(), leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'` })
                .where(eq(jobs.id, job.id))
                .returning();
            return claimed;
        });
    }
    async heartbeat(id: string, token: string) {
        const result = await this.db
            .update(jobs)
            .set({ leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'` })
            .where(and(eq(jobs.id, id), eq(jobs.leaseToken, token), eq(jobs.status, 'running'), gt(jobs.leaseExpiresAt, sql`clock_timestamp()`)))
            .returning();
        if (!result.length) throw new Error('Publication lease lost.');
    }
    private async inspect(job: typeof jobs.$inferSelect, tx: Tx) {
        const [model] = await tx.select().from(knowledgeModels).where(modelWhere(job));
        const [draft] = await tx
            .select()
            .from(candidates)
            .where(and(scoped(job), eq(candidates.id, job.candidateId)));
        const links = await tx.select().from(evidence).where(eq(evidence.candidateId, job.candidateId));
        const definitions = model ? projectOssieDocument(model.modelJson).definitions : [];
        const publishedRules = await tx.select().from(rules).where(eq(rules.knowledgeModelId, job.knowledgeModelId));
        const sources = await tx.select().from(knowledgeModelSources).where(eq(knowledgeModelSources.knowledgeModelId, job.knowledgeModelId));
        let reason: string | null = null;
        if (!model || model.publicationMode !== 'automatic' || model.publicationEpoch !== job.publicationEpoch) reason = 'policy_changed';
        else if (!draft || draft.status !== 'pending' || draft.manualOnly || draft.publicationEpoch !== job.publicationEpoch) reason = 'manual_review_required';
        else if (draft.action !== 'add' || draft.targetAssetId || draft.classificationReason) reason = 'individual_review_required';
        else if (draft.payload.ruleCandidateIds?.length) reason = 'joint_review_required';
        else if (!links.length) reason = 'evidence_required';
        if (draft && !reason) {
            const p = draft.payload;
            if (p.sourceConnectionId && !sources.some(s => s.connectionId === p.sourceConnectionId)) reason = 'mapping_required';
            const ownNames = new Set([p.name, ...p.aliases].map(name => knowledgeItemKey({ ...p, name, sourceConnectionId: null })));
            const sameName = (name: string, aliases: string[] = []) =>
                [name, ...aliases].some(value => ownNames.has(knowledgeItemKey({ ...p, name: value, sourceConnectionId: null })));
            const peers = await tx
                .select()
                .from(candidates)
                .where(and(scoped(job), eq(candidates.status, 'pending')));
            if (peers.some(c => c.id !== draft.id && c.payload.kind === p.kind && sameName(c.payload.name, c.payload.aliases))) reason = 'conflict';
            if (p.kind === 'metric') {
                if (definitions.some(d => d.kind === 'metric' && sameName(d.name, d.aliases))) reason = 'conflict';
                if (!p.sourceConnectionId || !p.source || !p.expression) reason = 'mapping_required';
                const [connection] = p.sourceConnectionId
                    ? await tx
                          .select()
                          .from(connections)
                          .where(and(eq(connections.id, p.sourceConnectionId), eq(connections.organizationId, job.organizationId)))
                    : [];
                const text = links
                    .map(e => e.quote)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .toLowerCase();
                if (
                    !connection ||
                    ![connection.name, connection.id].some(value => text.includes(value.toLowerCase())) ||
                    [p.source, p.expression, p.timeDimension, ...(p.filters ?? [])]
                        .filter((v): v is string => Boolean(v))
                        .some(value => !text.includes(value.replace(/\s+/g, ' ').toLowerCase()))
                )
                    reason = 'mapping_required';
                if ((p.ruleIds ?? []).some(id => !publishedRules.some(r => r.id === id && r.status === 'active'))) reason = 'joint_review_required';
            } else {
                if (publishedRules.some(r => sameName(r.payload.name, r.payload.aliases))) reason = 'conflict';
                if (!p.applicationScope || !p.sharingEvidence || !links.some(e => e.quote.includes(p.sharingEvidence!))) reason = 'scope_required';
                const applicable = definitions.filter(
                    d =>
                        d.kind === 'metric' &&
                        isPublishedDefinition(d) &&
                        (p.applicationScope === 'model' ||
                            (p.applicationScope === 'data_source' && d.sourceConnectionId === p.sourceConnectionId) ||
                            (p.applicationScope === 'metrics' && (p.metricIds ?? []).includes(d.id))),
                );
                if (applicable.length) reason = 'affects_existing_metrics';
                if (p.applicationScope === 'metrics' && (!p.metricIds?.length || p.metricIds.some(id => !definitions.some(d => d.id === id && d.kind === 'metric'))))
                    reason = 'scope_required';
                if ((p.applicationScope === 'model' && p.sourceConnectionId) || (p.applicationScope === 'data_source' && !p.sourceConnectionId)) reason = 'scope_required';
            }
            for (const link of links) {
                const [source] = link.sourceId ? await tx.select().from(knowledgeSources).where(eq(knowledgeSources.id, link.sourceId)) : [];
                const [connector] = link.sourceId
                    ? await tx
                          .select({ active: knowledgeConnectors.autoExtract, status: knowledgeConnectors.status })
                          .from(knowledgeConnectorItems)
                          .innerJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
                          .where(eq(knowledgeConnectorItems.knowledgeSourceId, link.sourceId))
                    : [];
                if (
                    !source ||
                    source.organizationId !== job.organizationId ||
                    source.knowledgeModelId !== job.knowledgeModelId ||
                    link.state !== 'current' ||
                    knowledgeHash(source.contentText) !== link.sourceHash ||
                    !source.contentText.includes(link.quote)
                )
                    reason = 'source_changed';
                if (!connector?.active || connector.status === 'disabled') reason = 'connector_disabled';
            }
        }
        return { draft, reason, fingerprint: knowledgeHash({ model: model?.modelJson, epoch: model?.publicationEpoch, draft, links, publishedRules, sources }) };
    }
    async prepare(job: typeof jobs.$inferSelect) {
        return this.inspect(job, this.db);
    }
    async complete(id: string, token: string, fingerprint: string) {
        return this.db.transaction(async tx => {
            const [initial] = await tx.select().from(jobs).where(eq(jobs.id, id));
            if (!initial) throw new Error('Publication job not found.');
            await tx.select().from(knowledgeModels).where(modelWhere(initial)).for('update');
            const [job] = await tx
                .select()
                .from(jobs)
                .where(and(eq(jobs.id, id), eq(jobs.leaseToken, token), eq(jobs.status, 'running'), gt(jobs.leaseExpiresAt, sql`clock_timestamp()`)))
                .for('update');
            if (!job) throw new Error('Publication lease lost.');
            const current = await this.inspect(job, tx);
            if (current.reason || current.fingerprint !== fingerprint) {
                await tx
                    .update(jobs)
                    .set({ status: 'review', error: current.reason ?? 'version_changed', leaseToken: null })
                    .where(eq(jobs.id, id));
                return false;
            }
            await this.extraction.review(
                {
                    organizationId: job.organizationId,
                    knowledgeModelId: job.knowledgeModelId,
                    candidateId: job.candidateId,
                    userId: 'system:knowledge-publication',
                    automatic: true,
                    decision: 'approve',
                },
                tx,
            );
            await tx.update(jobs).set({ status: 'completed', error: null, leaseToken: null }).where(eq(jobs.id, id));
            return true;
        });
    }
    async fail(id: string, token: string, message: string, retry: boolean, review = false) {
        const [job] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.id, id), eq(jobs.leaseToken, token), eq(jobs.status, 'running')));
        if (!job) return;
        await this.db
            .update(jobs)
            .set({
                status: review ? 'review' : retry && job.attempts < 5 ? 'queued' : 'failed',
                error: message.slice(0, 1000),
                leaseToken: null,
                availableAt: sql`clock_timestamp() + ${30 * 2 ** (job.attempts - 1)} * interval '1 second'`,
            })
            .where(and(eq(jobs.id, id), eq(jobs.leaseToken, token)));
    }
    async retry(input: ModelScope & { id: string }) {
        const model = await this.extraction.assertModel(input);
        await this.db
            .update(jobs)
            .set({ status: 'queued', attempts: 0, error: null, availableAt: sql`clock_timestamp()` })
            .where(
                and(
                    eq(jobs.id, input.id),
                    eq(jobs.knowledgeModelId, model.id),
                    eq(jobs.organizationId, input.organizationId),
                    eq(jobs.publicationEpoch, model.publicationEpoch),
                    eq(jobs.status, 'failed'),
                    sql`${model.publicationMode} = 'automatic'`,
                ),
            );
    }
    async history(input: ModelScope) {
        await this.extraction.assertModel(input);
        const [events, tasks] = await Promise.all([
            this.db
                .select()
                .from(history)
                .where(and(eq(history.organizationId, input.organizationId), eq(history.knowledgeModelId, input.knowledgeModelId)))
                .orderBy(desc(history.createdAt)),
            this.db
                .select()
                .from(jobs)
                .where(and(eq(jobs.organizationId, input.organizationId), eq(jobs.knowledgeModelId, input.knowledgeModelId)))
                .orderBy(desc(jobs.updatedAt)),
        ]);
        return {
            events: events.map(event => ({
                ...event,
                evidence: event.evidence.map(e => ({ ...e, sourceTitle: knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl }) })),
            })),
            tasks,
        };
    }
    async restore(input: ModelScope & { id: string; userId: string }) {
        return this.db.transaction(async tx => {
            const [model] = await tx.select().from(knowledgeModels).where(modelWhere(input)).for('update');
            if (!model) throw new Error('Knowledge model not found.');
            const [event] = await tx
                .select()
                .from(history)
                .where(and(eq(history.id, input.id), eq(history.knowledgeModelId, model.id), eq(history.kind, 'background')));
            const [draft] = event?.candidateId
                ? await tx
                      .select()
                      .from(candidates)
                      .where(and(eq(candidates.id, event.candidateId), scoped(input), eq(candidates.status, 'background')))
                : [];
            if (!draft) throw new Error('This item is no longer available for restoration.');
            const links = await tx.select().from(evidence).where(eq(evidence.candidateId, draft.id));
            for (const link of links) {
                const [source] = link.sourceId ? await tx.select().from(knowledgeSources).where(eq(knowledgeSources.id, link.sourceId)) : [];
                if (!source || link.state !== 'current' || knowledgeHash(source.contentText) !== link.sourceHash)
                    throw new Error('Source changed; extract its current version before restoring.');
            }
            await tx
                .update(candidates)
                .set({ status: 'pending', manualOnly: 1, publicationEpoch: null, classificationReason: 'restored_for_review' })
                .where(eq(candidates.id, draft.id));
            await tx
                .insert(history)
                .values({ ...input, id: undefined, candidateId: draft.id, kind: 'restored', actorId: input.userId, payload: draft.payload, evidence: event.evidence });
            return { id: draft.id };
        });
    }
    async withdraw(input: ModelScope & { id: string; expectedRevision: string; userId: string }) {
        return this.db.transaction(async tx => {
            const [model] = await tx.select().from(knowledgeModels).where(modelWhere(input)).for('update');
            if (!model) throw new Error('Knowledge model not found.');
            const [event] = await tx
                .select()
                .from(history)
                .where(and(eq(history.id, input.id), eq(history.knowledgeModelId, model.id), eq(history.kind, 'automatic')));
            if (!event?.assetId || !event.candidateId || event.assetRevision !== input.expectedRevision) throw new Error('Publication changed; use the asset editor.');
            const [draft] = await tx
                .select()
                .from(candidates)
                .where(and(eq(candidates.id, event.candidateId), scoped(input), eq(candidates.status, 'approved')));
            if (!draft) throw new Error('Publication was already withdrawn.');
            const definitions = projectOssieDocument(model.modelJson).definitions;
            if (event.payload.kind === 'metric') {
                const metric = definitions.find(d => d.id === event.assetId);
                const queries = await tx.select().from(knowledgeVerifiedQueries).where(eq(knowledgeVerifiedQueries.knowledgeModelId, model.id));
                const refs = await tx
                    .select()
                    .from(references)
                    .where(and(eq(references.knowledgeModelId, model.id), eq(references.metricId, event.assetId)));
                const permittedRules = new Set(event.payload.ruleIds ?? []);
                if (
                    !metric ||
                    metric.status !== 'auto_published' ||
                    knowledgeHash(metric) !== event.assetRevision ||
                    queries.some(q => q.definitionIds.includes(metric.id)) ||
                    refs.some(r => !permittedRules.has(r.ruleId))
                )
                    throw new Error('Asset was edited or referenced; use the asset editor.');
                const ossie = applyKnowledgeDefinitions(
                    model.modelJson,
                    definitions.map(d => (d.id === metric.id ? { ...d, status: 'unverified' as const } : d)),
                );
                await tx
                    .update(knowledgeModels)
                    .set({ modelJson: ossie, modelYaml: serializeOssieDocument(ossie) })
                    .where(modelWhere(input));
            } else {
                const [rule] = await tx
                    .select()
                    .from(rules)
                    .where(and(eq(rules.id, event.assetId), eq(rules.knowledgeModelId, model.id)));
                const affected = definitions.some(
                    d =>
                        d.kind === 'metric' &&
                        isPublishedDefinition(d) &&
                        (rule?.applicationScope === 'model' || (rule?.applicationScope === 'data_source' && d.sourceConnectionId === rule.payload.sourceConnectionId)),
                );
                const refs = await tx.select().from(references).where(eq(references.ruleId, event.assetId));
                if (!rule || rule.status !== 'active' || rule.publicationMethod !== 'automatic' || String(rule.revision) !== event.assetRevision || affected || refs.length)
                    throw new Error('Rule was edited or referenced; use the rule editor.');
                await tx
                    .update(rules)
                    .set({ status: 'archived', revision: rule.revision + 1 })
                    .where(eq(rules.id, rule.id));
            }
            await tx
                .delete(knowledgeAssetSources)
                .where(
                    and(
                        eq(knowledgeAssetSources.knowledgeModelId, model.id),
                        eq(knowledgeAssetSources.assetId, event.assetId),
                        eq(knowledgeAssetSources.assetType, event.payload.kind === 'metric' ? 'definition' : 'business_rule'),
                    ),
                );
            await tx.update(evidence).set({ assetId: null, assetType: null }).where(eq(evidence.candidateId, draft.id));
            await tx.update(candidates).set({ status: 'superseded', manualOnly: 1 }).where(eq(candidates.id, draft.id));
            const [restored] = await tx
                .insert(candidates)
                .values({
                    organizationId: input.organizationId,
                    knowledgeModelId: model.id,
                    payload: draft.payload,
                    payloadHash: draft.payloadHash,
                    itemKey: draft.itemKey,
                    manualOnly: 1,
                    action: 'update',
                    targetAssetId: event.assetId,
                    targetRevision:
                        event.payload.kind === 'metric'
                            ? knowledgeHash({ ...definitions.find(d => d.id === event.assetId)!, status: 'unverified' })
                            : String(Number(event.assetRevision) + 1),
                    classificationReason: 'withdrawn_for_review',
                })
                .returning();
            await copyDraftEvidence(tx, restored.id, await tx.select().from(evidence).where(eq(evidence.candidateId, draft.id)));
            await tx.insert(history).values({
                organizationId: input.organizationId,
                knowledgeModelId: model.id,
                candidateId: restored.id,
                kind: 'withdrawn',
                assetId: event.assetId,
                assetRevision: event.assetRevision,
                actorId: input.userId,
                payload: event.payload,
                evidence: event.evidence,
            });
            return { id: restored.id };
        });
    }
}
