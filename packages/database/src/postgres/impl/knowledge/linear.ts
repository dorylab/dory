import { and, eq, inArray, sql } from 'drizzle-orm';

import type { PostgresDBClient } from '@dory/shared';
import { knowledgeConnectors, knowledgeConnectorSyncJobs, knowledgeLinearCredentials } from '../../schemas/knowledge';

export class LinearKnowledgeStore {
    constructor(private readonly db: PostgresDBClient) {}

    async listCredentials(organizationId: string) {
        return this.db
            .select({
                id: knowledgeLinearCredentials.id,
                workspaceId: knowledgeLinearCredentials.workspaceId,
                workspaceName: knowledgeLinearCredentials.workspaceName,
                status: knowledgeLinearCredentials.status,
                version: knowledgeLinearCredentials.version,
            })
            .from(knowledgeLinearCredentials)
            .where(eq(knowledgeLinearCredentials.organizationId, organizationId));
    }

    async getCredential(organizationId: string, credentialId: string) {
        const [credential] = await this.db
            .select()
            .from(knowledgeLinearCredentials)
            .where(and(eq(knowledgeLinearCredentials.id, credentialId), eq(knowledgeLinearCredentials.organizationId, organizationId)));
        if (!credential) throw new Error('Linear credential not found.');
        return credential;
    }

    async saveCredential(input: { organizationId: string; workspaceId: string; workspaceName: string; apiKeyEncrypted: string; credentialId?: string }) {
        return this.db.transaction(async tx => {
            if (input.credentialId) {
                const [existing] = await tx
                    .select()
                    .from(knowledgeLinearCredentials)
                    .where(and(eq(knowledgeLinearCredentials.id, input.credentialId), eq(knowledgeLinearCredentials.organizationId, input.organizationId)))
                    .for('update');
                if (!existing || existing.workspaceId !== input.workspaceId) throw new Error('The API Key must belong to the same Linear workspace.');
            }
            const { credentialId: _id, ...values } = input;
            // Credential and connector revisions fence all requests using the previous key.
            const [credential] = await tx
                .insert(knowledgeLinearCredentials)
                .values(values)
                .onConflictDoUpdate({
                    target: [knowledgeLinearCredentials.organizationId, knowledgeLinearCredentials.workspaceId],
                    set: { ...values, status: 'active', version: sql`${knowledgeLinearCredentials.version} + 1`, updatedAt: new Date() },
                })
                .returning();
            const connectors = await tx
                .update(knowledgeConnectors)
                .set({
                    credentialId: credential.id,
                    linearWorkspaceName: input.workspaceName,
                    status: 'pending',
                    lastError: null,
                    nextSyncAt: new Date(),
                    configRevision: sql`${knowledgeConnectors.configRevision} + 1`,
                })
                .where(
                    and(
                        eq(knowledgeConnectors.organizationId, input.organizationId),
                        eq(knowledgeConnectors.provider, 'linear'),
                        eq(knowledgeConnectors.linearWorkspaceId, input.workspaceId),
                    ),
                )
                .returning({ id: knowledgeConnectors.id });
            if (connectors.length) {
                await tx
                    .update(knowledgeConnectorSyncJobs)
                    .set({ status: 'failed', leaseToken: null, error: 'Linear API Key changed.', updatedAt: new Date() })
                    .where(
                        and(
                            inArray(
                                knowledgeConnectorSyncJobs.connectorId,
                                connectors.map(c => c.id),
                            ),
                            inArray(knowledgeConnectorSyncJobs.status, ['queued', 'running']),
                        ),
                    );
                await tx.insert(knowledgeConnectorSyncJobs).values(connectors.map(c => ({ connectorId: c.id })));
            }
            return credential;
        });
    }

    async invalidateCredential(organizationId: string, credentialId: string, version: number) {
        return this.db.transaction(async tx => {
            const [credential] = await tx
                .update(knowledgeLinearCredentials)
                .set({ status: 'invalid', updatedAt: new Date() })
                .where(
                    and(
                        eq(knowledgeLinearCredentials.organizationId, organizationId),
                        eq(knowledgeLinearCredentials.id, credentialId),
                        eq(knowledgeLinearCredentials.version, version),
                        eq(knowledgeLinearCredentials.status, 'active'),
                    ),
                )
                .returning();
            if (!credential) return false;
            const connectors = await tx
                .update(knowledgeConnectors)
                .set({
                    status: 'disabled',
                    lastError: 'Update the Linear API Key to resume synchronization.',
                    configRevision: sql`${knowledgeConnectors.configRevision} + 1`,
                })
                .where(eq(knowledgeConnectors.credentialId, credential.id))
                .returning({ id: knowledgeConnectors.id });
            if (connectors.length)
                await tx
                    .update(knowledgeConnectorSyncJobs)
                    .set({
                        status: 'failed',
                        error: 'Update the Linear API Key to resume synchronization.',
                        leaseToken: null,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            inArray(
                                knowledgeConnectorSyncJobs.connectorId,
                                connectors.map(c => c.id),
                            ),
                            inArray(knowledgeConnectorSyncJobs.status, ['queued', 'running']),
                        ),
                    );
            return true;
        });
    }
}
