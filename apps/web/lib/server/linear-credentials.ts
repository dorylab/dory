import 'server-only';

import type { DBService } from '@dory/database';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { decrypt, encrypt } from '@dory/web-utils/crypto';
import { LinearApiError, readLinearWorkspace, type LinearClientOptions } from './linear-client';

export function linearRuntimeAvailable() {
    const runtime = getRuntimeForServer() ?? 'web';
    return runtime === 'web' || runtime === 'docker' || runtime === 'desktop';
}

export function linearConfigured() {
    // The crypto utility has an ephemeral fallback. Never use it for persisted credentials.
    return linearRuntimeAvailable() && Boolean(process.env.DS_SECRET_KEY?.trim()) && Buffer.from(process.env.DS_SECRET_KEY ?? '', 'base64').length === 32;
}

export function assertLinearAvailable() {
    if (!linearConfigured()) throw new Error('A persistent 32-byte DS_SECRET_KEY is required to use Linear.');
}

export function assertLinearAdmin(ctx: { access: { role?: string | null } }) {
    if (!linearRuntimeAvailable()) throw new Error('Linear is unavailable in this runtime.');
    if (ctx.access.role !== 'owner' && ctx.access.role !== 'admin')
        throw Object.assign(new Error('Only workspace owners and administrators can manage Linear connectors.'), { status: 403 });
}

export async function saveLinearApiKey(
    db: DBService,
    input: { organizationId: string; knowledgeModelId: string; apiKey: string; credentialId?: string; connectorId?: string },
    options: LinearClientOptions = {},
) {
    assertLinearAvailable();
    await db.knowledge.getModel(input);
    const existing = input.credentialId ? await db.knowledge.linear.getCredential(input.organizationId, input.credentialId) : null;
    const connector = input.connectorId ? await db.knowledge.getConnector({ organizationId: input.organizationId, connectorId: input.connectorId }) : null;
    if (connector && (connector.provider !== 'linear' || connector.knowledgeModelId !== input.knowledgeModelId)) throw new Error('Linear connector not found.');
    const workspace = await readLinearWorkspace(input.apiKey, options);
    if (connector && connector.linearWorkspaceId !== workspace.id) throw new Error('The API Key must belong to the same Linear workspace.');
    if (existing && existing.workspaceId !== workspace.id) throw new Error('The API Key must belong to the same Linear workspace.');
    const credential = await db.knowledge.linear.saveCredential({
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        apiKeyEncrypted: await encrypt(input.apiKey),
        credentialId: input.credentialId,
    });
    return { id: credential.id, workspaceId: credential.workspaceId, workspaceName: credential.workspaceName, status: credential.status, version: credential.version };
}

export async function withLinearAccess<T>(db: DBService, organizationId: string, credentialId: string, read: (apiKey: string) => Promise<T>) {
    assertLinearAvailable();
    const credential = await db.knowledge.linear.getCredential(organizationId, credentialId);
    if (credential.status !== 'active') throw new LinearApiError('Update the Linear API Key before syncing.');
    const apiKey = await decrypt(credential.apiKeyEncrypted);
    try {
        return await read(apiKey);
    } catch (error) {
        if (error instanceof LinearApiError && error.unauthorized) await db.knowledge.linear.invalidateCredential(organizationId, credentialId, credential.version);
        throw error;
    }
}
