import 'server-only';

import type { DBService } from '@dory/database';
import type { LocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import { isLocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import { MCP_LOCAL_AI_SCOPE, authenticateMcpRequest, hasMcpScope, type McpAuthContext } from '@/lib/server/mcp/auth';

export const LOCAL_AI_BRIDGE_TARGET_PREFIX = 'bridge:';
const LOCAL_AI_BRIDGE_ONLINE_WINDOW_MS = 45_000;
const LOCAL_AI_JOB_TIMEOUT_MS = 120_000;
const LOCAL_AI_JOB_POLL_MS = 750;
const LOCAL_AI_MAX_PROMPT_CHARS = 400_000;
const LOCAL_AI_MAX_RESULT_CHARS = 2 * 1024 * 1024;

export type LocalAiBridgeSummary = {
    id: string;
    provider: LocalAiAgentProvider;
    name: string;
    online: boolean;
    supportsDoryMcpTools: boolean;
    lastSeenAt: string | null;
    createdAt: string | null;
};

export function createLocalAiBridgeTarget(bridgeId: string) {
    return `${LOCAL_AI_BRIDGE_TARGET_PREFIX}${bridgeId}`;
}

export function parseLocalAiBridgeTarget(value?: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed?.startsWith(LOCAL_AI_BRIDGE_TARGET_PREFIX)) return null;
    return trimmed.slice(LOCAL_AI_BRIDGE_TARGET_PREFIX.length).trim() || null;
}

export function isLocalAiBridgeTarget(value?: string | null) {
    return Boolean(parseLocalAiBridgeTarget(value));
}

export function isLocalAiBridgeOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()) {
    if (!lastSeenAt) return false;
    const value = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
    return Number.isFinite(value) && now - value <= LOCAL_AI_BRIDGE_ONLINE_WINDOW_MS;
}

export function localAiBridgeSupportsDoryMcpTools(capabilities: unknown): boolean {
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return false;
    return (capabilities as Record<string, unknown>).doryMcpTools === true;
}

export async function listLocalAiBridgeSummaries(db: DBService, organizationId: string): Promise<LocalAiBridgeSummary[]> {
    const now = Date.now();
    const bridges = await db.mcp.listLocalAiBridges(organizationId);
    return bridges
        .filter(bridge => isLocalAiAgentProvider(bridge.provider))
        .map(bridge => ({
            id: bridge.id,
            provider: bridge.provider as LocalAiAgentProvider,
            name: bridge.name,
            online: isLocalAiBridgeOnline(bridge.lastSeenAt, now),
            supportsDoryMcpTools: localAiBridgeSupportsDoryMcpTools(bridge.capabilities),
            lastSeenAt: bridge.lastSeenAt ? bridge.lastSeenAt.toISOString() : null,
            createdAt: bridge.createdAt ? bridge.createdAt.toISOString() : null,
        }));
}

export async function assertLocalAiBridgeAvailable(db: DBService, organizationId: string, provider: LocalAiAgentProvider, bridgeId: string) {
    const bridge = await db.mcp.getLocalAiBridge(organizationId, bridgeId);
    if (!bridge || bridge.provider !== provider) {
        throw new Error('Local AI bridge was not found.');
    }
    if (!isLocalAiBridgeOnline(bridge.lastSeenAt)) {
        throw new Error('Local AI bridge is offline. Run `npx -y @getdory/cli runtime install --codex-agent --url <dory-url>` on this device.');
    }
    return bridge;
}

export async function authenticateLocalAiBridgeRequest(req: Request) {
    const auth = await authenticateMcpRequest(req);
    if (!auth.ok) return auth;
    if (!hasMcpScope(auth.context, MCP_LOCAL_AI_SCOPE)) {
        return {
            ok: false as const,
            status: 403,
            message: 'MCP token does not have local AI bridge scope. Run `npx -y @getdory/cli runtime install --codex-agent --url <dory-url>` to authorize it.',
        };
    }
    return auth;
}

export function assertLocalAiBridgePayloadSize(input: { prompt?: string | null; text?: string | null; stdout?: string | null; stderr?: string | null }) {
    if ((input.prompt?.length ?? 0) > LOCAL_AI_MAX_PROMPT_CHARS) {
        throw new Error('Local AI prompt exceeded the maximum size.');
    }
    if (
        (input.text?.length ?? 0) > LOCAL_AI_MAX_RESULT_CHARS ||
        (input.stdout?.length ?? 0) > LOCAL_AI_MAX_RESULT_CHARS ||
        (input.stderr?.length ?? 0) > LOCAL_AI_MAX_RESULT_CHARS
    ) {
        throw new Error('Local AI result exceeded the maximum size.');
    }
}

export async function createAndWaitForLocalAiBridgeJob(options: {
    db: DBService;
    organizationId: string;
    provider: LocalAiAgentProvider;
    bridgeId: string;
    model: string;
    prompt: string;
    signal?: AbortSignal;
}) {
    assertLocalAiBridgePayloadSize({ prompt: options.prompt });
    await assertLocalAiBridgeAvailable(options.db, options.organizationId, options.provider, options.bridgeId);

    const startedAt = Date.now();
    const expiresAt = new Date(startedAt + LOCAL_AI_JOB_TIMEOUT_MS);
    const job = await options.db.mcp.createLocalAiJob({
        organizationId: options.organizationId,
        bridgeId: options.bridgeId,
        provider: options.provider,
        model: options.model,
        prompt: options.prompt,
        expiresAt,
    });

    while (Date.now() - startedAt <= LOCAL_AI_JOB_TIMEOUT_MS) {
        if (options.signal?.aborted) {
            throw new Error('Local AI bridge request was aborted.');
        }

        const current = await options.db.mcp.getLocalAiJob(options.organizationId, job.id);
        if (!current) {
            throw new Error('Local AI job disappeared before completion.');
        }
        if (current.status === 'completed') {
            return {
                text: current.resultText ?? '',
                stdout: current.stdout ?? '',
                stderr: current.stderr ?? '',
            };
        }
        if (current.status === 'failed' || current.status === 'expired') {
            throw new Error(current.errorMessage ?? `Local AI job ${current.status}.`);
        }

        await new Promise(resolve => setTimeout(resolve, LOCAL_AI_JOB_POLL_MS));
    }

    throw new Error('Local AI bridge timed out.');
}

export function localAiBridgeResponseContext(context: McpAuthContext) {
    return {
        organizationId: context.organizationId,
        userId: context.userId,
        mcpTokenId: context.tokenId,
    };
}
