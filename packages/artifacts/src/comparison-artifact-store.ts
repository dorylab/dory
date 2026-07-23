import type { SchemaSnapshot } from '@dory/schema-compare';

import { joinObjectPath, readableToBuffer, safeObjectPathPart, type ObjectStore } from './object-store';

export type ComparisonSnapshotArtifactRef = {
    store: string;
    comparisonId: string;
    basePath: string;
    currentPath: string;
    desiredPath: string;
};

export class ComparisonArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly prefix = 'artifacts',
    ) {}

    async putSnapshots(input: { organizationId: string; comparisonId: string; current: SchemaSnapshot; desired: SchemaSnapshot }): Promise<ComparisonSnapshotArtifactRef> {
        const basePath = this.basePath(input.organizationId, input.comparisonId);
        const currentPath = 'current.json';
        const desiredPath = 'desired.json';
        try {
            await Promise.all([
                this.objectStore.put(joinObjectPath(basePath, currentPath), JSON.stringify(input.current), {
                    contentType: 'application/json',
                }),
                this.objectStore.put(joinObjectPath(basePath, desiredPath), JSON.stringify(input.desired), {
                    contentType: 'application/json',
                }),
            ]);
        } catch (error) {
            await this.objectStore.deletePrefix(basePath).catch(() => undefined);
            throw error;
        }
        return {
            store: this.objectStore.kind,
            comparisonId: input.comparisonId,
            basePath,
            currentPath,
            desiredPath,
        };
    }

    async readSnapshots(ref: ComparisonSnapshotArtifactRef): Promise<{ current: SchemaSnapshot; desired: SchemaSnapshot }> {
        const [current, desired] = await Promise.all([
            readableToBuffer(await this.objectStore.get(joinObjectPath(ref.basePath, ref.currentPath))),
            readableToBuffer(await this.objectStore.get(joinObjectPath(ref.basePath, ref.desiredPath))),
        ]);
        return {
            current: JSON.parse(current.toString('utf8')) as SchemaSnapshot,
            desired: JSON.parse(desired.toString('utf8')) as SchemaSnapshot,
        };
    }

    async deleteComparison(ref: ComparisonSnapshotArtifactRef): Promise<void> {
        await this.objectStore.deletePrefix(ref.basePath);
    }

    basePath(organizationId: string, comparisonId: string) {
        const organization = safeObjectPathPart(organizationId);
        return joinObjectPath(this.prefix, organization.startsWith('org_') ? organization : `org_${organization}`, 'comparisons', safeObjectPathPart(comparisonId));
    }
}
