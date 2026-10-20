import 'server-only';
import { Output } from 'ai';
import type { DBService } from '@dory/database';
import { generateText } from '@/lib/ai/gateway';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import {
    splitKnowledgeContent,
    knowledgeEvidenceExcerpts,
    parseKnowledgeExtraction,
    EXTRACTION_INSTRUCTIONS,
    KnowledgeExtractionValidationError,
    knowledgeExtractionFailure,
} from './knowledge-extraction-core';
import type { ExtractedCandidate } from '@dory/database/postgres/schemas/knowledge-extraction';

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
    private async drain() {
        for (;;) {
            const job = await this.db.knowledge.extraction.claim();
            if (!job) break;
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
                await this.db.knowledge.extraction.complete(job.id, token, output);
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
