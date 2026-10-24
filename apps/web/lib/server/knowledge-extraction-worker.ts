import 'server-only';

import type { DBService } from '@dory/database';
import type { OrganizationItem, OrganizedItem } from '@dory/database/postgres/impl/knowledge/organization';
import type { ExtractedCandidate } from '@dory/database/postgres/schemas/knowledge-extraction';
import { Output } from 'ai';

import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { generateText } from '@/lib/ai/gateway';

import {
    EXTRACTION_INSTRUCTIONS,
    knowledgeEvidenceExcerpts,
    knowledgeExtractionFailure,
    KnowledgeExtractionValidationError,
    parseKnowledgeExtraction,
    splitKnowledgeContent,
} from './knowledge-extraction-core';
import { validateMetricMappingWithService } from './knowledge-metric-validation';
import { ORGANIZATION_INSTRUCTIONS, parseKnowledgeOrganization, reconcileOrganizedItems } from './knowledge-organization-core';

const runners = new WeakMap<DBService, KnowledgeExtractionRunner>();
export class KnowledgeExtractionRunner {
    private running = false;
    constructor(private readonly db: DBService) {}
    wake() {
        if (this.running) return;
        this.running = true;
        void this.drain()
            .catch(() => console.error('[knowledge-extraction] Worker failed; pending jobs will recover on the next scan.'))
            .finally(() => {
                this.running = false;
            });
    }
    private async organize() {
        const store = this.db.knowledge.extraction.organization;
        for (;;) {
            const job = await store.claim();
            if (!job) return;
            const token = job.leaseToken!;
            const heartbeat = setInterval(() => {
                void store.heartbeat(job.id, token).catch(() => undefined);
            }, 30_000);
            heartbeat.unref?.();
            try {
                const snapshot = await store.snapshot(job);
                const resolved = snapshot.items.length
                    ? await resolveAiLanguageModel({ db: this.db, organizationId: job.organizationId, role: 'action', allowCloudProxy: false })
                    : null;
                const output: OrganizedItem[] = [];
                const process = async (items: OrganizationItem[]): Promise<void> => {
                    if (!items.length || !resolved) return;
                    await store.heartbeat(job.id, token);
                    const numbered = items.map((item, index) => ({ ...item, id: `I${index + 1}` }));
                    const originalIds = new Map(numbered.map((item, index) => [item.id, items[index].id]));
                    try {
                        let feedback: string | undefined;
                        for (let repair = 0; repair < 2; repair++) {
                            const result = await generateText({
                                model: resolved.model,
                                instructions: ORGANIZATION_INSTRUCTIONS,
                                output: Output.json(),
                                timeout: 90_000,
                                prompt: JSON.stringify({
                                    validationFeedback: feedback,
                                    inputs: numbered,
                                    officialMetrics: snapshot.definitions.filter(d => d.kind === 'metric'),
                                    officialRules: snapshot.rules.map(r => ({ id: r.id, revision: r.revision, payload: r.payload })),
                                }),
                                maxOutputTokens: 12000,
                                temperature: 0,
                                context: {
                                    organizationId: job.organizationId,
                                    feature: 'knowledge_extraction',
                                    model: resolved.modelName,
                                    provider: resolved.providerKey,
                                    gateway: resolved.gateway,
                                    promptVersion: 5,
                                },
                            });
                            if (result.finishReason === 'length') throw new Error('Organization output exceeded context budget.');
                            try {
                                output.push(
                                    ...parseKnowledgeOrganization(result.text, numbered).map(item => ({ ...item, inputIds: item.inputIds.map(id => originalIds.get(id)!) })),
                                );
                                break;
                            } catch (error) {
                                if (!(error instanceof KnowledgeExtractionValidationError) || repair === 1) throw error;
                                feedback = error.message;
                            }
                        }
                    } catch (error) {
                        const budget = /context|maximum.{0,20}tokens|exceed.{0,30}(token|budget)|too many tokens/i.test(error instanceof Error ? error.message : '');
                        if (!budget || items.length < 2) throw error;
                        const middle = Math.ceil(items.length / 2);
                        await process(items.slice(0, middle));
                        await process(items.slice(middle));
                    }
                };
                await process(snapshot.items);
                await store.complete(job.id, token, snapshot.fingerprint, reconcileOrganizedItems(output, snapshot.definitions));
            } catch (error) {
                const failure = knowledgeExtractionFailure(error);
                await store.fail(job.id, token, failure.message, failure.retry, failure.blocked);
            } finally {
                clearInterval(heartbeat);
            }
        }
    }
    private async publish() {
        const store = this.db.knowledge.extraction.publication;
        for (;;) {
            const job = await store.claim();
            if (!job) return;
            const token = job.leaseToken!;
            const heartbeat = setInterval(() => {
                void store.heartbeat(job.id, token).catch(() => undefined);
            }, 30_000);
            heartbeat.unref?.();
            try {
                const state = await store.prepare(job);
                if (state.reason || !state.draft) {
                    await store.fail(job.id, token, state.reason ?? 'manual_review_required', false, true);
                    continue;
                }
                await validateMetricMappingWithService(this.db, job.organizationId, job.knowledgeModelId, state.draft.payload);
                await store.complete(job.id, token, state.fingerprint);
            } catch (error) {
                const failure = knowledgeExtractionFailure(error);
                await store.fail(job.id, token, failure.retry ? 'temporary_publication_failure' : 'mapping_validation_failed', failure.retry, !failure.retry);
            } finally {
                clearInterval(heartbeat);
            }
        }
    }
    private async drain() {
        for (;;) {
            const job = await this.db.knowledge.extraction.claim();
            if (!job) {
                await this.organize();
                await this.publish();
                break;
            }
            const token = job.leaseToken!;
            let leaseLost = false;
            const heartbeat = setInterval(() => {
                void this.db.knowledge.extraction.heartbeat(job.id, token).catch(() => {
                    leaseLost = true;
                });
            }, 30_000);
            heartbeat.unref?.();
            try {
                const model = await this.db.knowledge.getModel({ organizationId: job.organizationId, knowledgeModelId: job.knowledgeModelId });
                const source = await this.db.knowledge.getKnowledgeSource({ organizationId: job.organizationId, knowledgeModelId: job.knowledgeModelId, id: job.sourceId! });
                // Server-side organization configuration only. Background jobs never
                // borrow browser cookies or fabricate an interactive request.
                const resolved = await resolveAiLanguageModel({ db: this.db, organizationId: job.organizationId, role: 'action', allowCloudProxy: false });
                const chunks = splitKnowledgeContent(source.contentText);
                const output: ExtractedCandidate[] = [];
                const allowed = new Set(model.dataSources.map(s => s.connectionId));
                for (let i = 0; i < chunks.length; i++) {
                    if (leaseLost) throw new Error('Extraction lease lost.');
                    await this.db.knowledge.extraction.heartbeat(job.id, token, i, chunks.length);
                    try {
                        let repairReason: string | undefined;
                        for (let repairAttempt = 0; repairAttempt < 2; repairAttempt++) {
                            const result = await generateText({
                                model: resolved.model,
                                instructions: EXTRACTION_INSTRUCTIONS,
                                output: Output.json(),
                                timeout: 90_000,
                                prompt: JSON.stringify({
                                    modelName: model.name,
                                    sourceTitle: source.fileName,
                                    dataSources: model.dataSources.map(s => ({ id: s.connectionId, name: s.name })),
                                    part: i + 1,
                                    totalParts: chunks.length,
                                    ...(repairReason
                                        ? {
                                              validationFeedback: repairReason,
                                              requiredFormat:
                                                  'Return {"candidates":[{"payload":{"kind":"business_rule","name":"...","description":"...","aliases":[],"sourceConnectionId":null},"evidenceIds":["E1"]}]}. Use only supplied excerpt IDs.',
                                          }
                                        : {}),
                                    untrustedSourceExcerpts: knowledgeEvidenceExcerpts(chunks[i]),
                                }),
                                temperature: 0,
                                maxOutputTokens: 6000,
                                context: {
                                    organizationId: job.organizationId,
                                    userId: job.createdBy,
                                    feature: 'knowledge_extraction',
                                    model: resolved.modelName,
                                    provider: resolved.providerKey,
                                    gateway: resolved.gateway,
                                    promptVersion: job.extractionVersion,
                                },
                            });
                            if (result.finishReason === 'length') throw new Error('Extraction output exceeded the model budget; no partial draft was saved.');
                            try {
                                output.push(...parseKnowledgeExtraction(result.text, chunks[i], allowed));
                                break;
                            } catch (error) {
                                if (!(error instanceof KnowledgeExtractionValidationError) || repairAttempt === 1) throw error;
                                repairReason = error.message;
                            }
                        }
                    } catch (error) {
                        const budget = /context.{0,30}(limit|length|window)|maximum.{0,20}tokens|exceed.{0,30}(token|budget)|too many tokens/i.test(
                            error instanceof Error ? error.message : '',
                        );
                        if (!budget || chunks[i].length < 2000) throw error;
                        const smaller = splitKnowledgeContent(chunks[i], Math.floor(chunks[i].length / 2));
                        chunks.splice(i, 1, ...smaller);
                        i--;
                    }
                }
                await this.db.knowledge.extraction.heartbeat(job.id, token, chunks.length, chunks.length);
                await this.db.knowledge.extraction.organization.stage(job.id, token, output);
            } catch (error) {
                // Persist only categorized diagnostics, never provider response bodies or prompts.
                const failure = knowledgeExtractionFailure(error);
                await this.db.knowledge.extraction.fail(job.id, token, failure.message, failure.retry, failure.blocked);
            } finally {
                clearInterval(heartbeat);
            }
        }
    }
}
export function getKnowledgeExtractionRunner(db: DBService) {
    let runner = runners.get(db);
    if (!runner) {
        runner = new KnowledgeExtractionRunner(db);
        runners.set(db, runner);
    }
    return runner;
}
