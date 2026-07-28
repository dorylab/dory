import type { SchemaComparisonResult, SchemaSnapshot } from '@dory/schema-compare';

import { joinObjectPath, readableToBuffer, safeObjectPathPart, type ObjectStore } from './object-store';

export type ComparisonRunArtifactManifest = {
    format: 'dory.comparison-run.v1';
    organizationId: string;
    comparisonId: string;
    runId: string;
    configuration: unknown;
    sourceSnapshotHash: string;
    targetSnapshotHash: string;
    createdAt: string;
    files: {
        source: string;
        target: string;
        diff: string;
        summary: string;
        aiReview: string;
    };
};

export type ComparisonRunArtifactRef = {
    version: 1;
    store: string;
    comparisonId: string;
    runId: string;
    basePath: string;
    manifestPath: string;
    sourcePath: string;
    targetPath: string;
    diffPath: string;
    summaryPath: string;
    aiReviewPath: string;
};

type PutRunInput = {
    organizationId: string;
    comparisonId: string;
    runId: string;
    configuration: unknown;
    source: SchemaSnapshot;
    target: SchemaSnapshot;
    comparison: SchemaComparisonResult;
};

export class ComparisonArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly prefix = 'artifacts',
    ) {}

    async putRun(input: PutRunInput): Promise<ComparisonRunArtifactRef> {
        const basePath = this.runBasePath(input.organizationId, input.comparisonId, input.runId);
        const ref: ComparisonRunArtifactRef = {
            version: 1,
            store: this.objectStore.kind,
            comparisonId: input.comparisonId,
            runId: input.runId,
            basePath,
            manifestPath: 'manifest.json',
            sourcePath: 'source.json',
            targetPath: 'target.json',
            diffPath: 'diff.json',
            summaryPath: 'summary.json',
            aiReviewPath: 'ai-review.json',
        };
        const manifest: ComparisonRunArtifactManifest = {
            format: 'dory.comparison-run.v1',
            organizationId: input.organizationId,
            comparisonId: input.comparisonId,
            runId: input.runId,
            configuration: input.configuration,
            sourceSnapshotHash: input.source.contentHash,
            targetSnapshotHash: input.target.contentHash,
            createdAt: new Date().toISOString(),
            files: {
                source: ref.sourcePath,
                target: ref.targetPath,
                diff: ref.diffPath,
                summary: ref.summaryPath,
                aiReview: ref.aiReviewPath,
            },
        };
        if (await this.objectStore.exists(joinObjectPath(basePath, ref.manifestPath))) {
            throw new Error(`Comparison Run artifact is immutable: ${input.runId}`);
        }

        try {
            await Promise.all([
                this.putJson(basePath, ref.sourcePath, input.source),
                this.putJson(basePath, ref.targetPath, input.target),
                this.putJson(basePath, ref.diffPath, input.comparison),
                this.putJson(basePath, ref.summaryPath, {
                    coverage: input.comparison.coverage,
                    summary: input.comparison.summary,
                    warnings: input.comparison.warnings,
                }),
            ]);
            // The manifest is the commit marker and must be written last.
            await this.putJson(basePath, ref.manifestPath, manifest);
            return ref;
        } catch (error) {
            await this.objectStore.deletePrefix(basePath).catch(() => undefined);
            throw error;
        }
    }

    async readRun(ref: ComparisonRunArtifactRef): Promise<{
        manifest: ComparisonRunArtifactManifest;
        source: SchemaSnapshot;
        target: SchemaSnapshot;
        comparison: SchemaComparisonResult;
    }> {
        const [manifest, source, target, comparison] = await Promise.all([
            this.readJson<ComparisonRunArtifactManifest>(ref.basePath, ref.manifestPath),
            this.readJson<SchemaSnapshot>(ref.basePath, ref.sourcePath),
            this.readJson<SchemaSnapshot>(ref.basePath, ref.targetPath),
            this.readJson<SchemaComparisonResult>(ref.basePath, ref.diffPath),
        ]);
        return { manifest, source, target, comparison };
    }

    async putAiReview(ref: ComparisonRunArtifactRef, review: unknown): Promise<void> {
        await this.putJson(ref.basePath, ref.aiReviewPath, review);
    }

    async deleteRun(ref: ComparisonRunArtifactRef): Promise<void> {
        await this.objectStore.deletePrefix(ref.basePath);
    }

    async deleteComparisonById(organizationId: string, comparisonId: string): Promise<void> {
        await this.objectStore.deletePrefix(this.comparisonBasePath(organizationId, comparisonId));
    }

    private comparisonBasePath(organizationId: string, comparisonId: string) {
        const organization = safeObjectPathPart(organizationId);
        return joinObjectPath(this.prefix, organization.startsWith('org_') ? organization : `org_${organization}`, 'comparisons', safeObjectPathPart(comparisonId));
    }

    private runBasePath(organizationId: string, comparisonId: string, runId: string) {
        return joinObjectPath(this.comparisonBasePath(organizationId, comparisonId), 'runs', safeObjectPathPart(runId));
    }

    private async putJson(basePath: string, filePath: string, value: unknown) {
        await this.objectStore.put(joinObjectPath(basePath, filePath), JSON.stringify(value), {
            contentType: 'application/json',
        });
    }

    private async readJson<T>(basePath: string, filePath: string): Promise<T> {
        const value = await readableToBuffer(await this.objectStore.get(joinObjectPath(basePath, filePath)));
        return JSON.parse(value.toString('utf8')) as T;
    }
}
