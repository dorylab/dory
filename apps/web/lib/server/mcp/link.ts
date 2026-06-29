import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MCP_DEFAULT_SCOPES, MCP_LINK_SCOPES } from './auth';

export const MCP_LINK_TTL_MS = 10 * 60 * 1000;

export const mcpLinkStartSchema = z.object({
    clientName: z.string().trim().min(1).max(80),
    verifierHash: z.string().regex(/^[a-f0-9]{64}$/i),
    scopes: z.array(z.enum(MCP_LINK_SCOPES)).optional(),
});

export const mcpLinkPollSchema = z.object({
    requestId: z.string().trim().min(1),
    verifier: z.string().trim().min(16).max(256),
});

export const mcpLinkDecisionSchema = z.object({
    requestId: z.string().trim().min(1),
    scopes: z.array(z.enum(MCP_LINK_SCOPES)).optional(),
});

export function hashMcpLinkVerifier(verifier: string) {
    return createHash('sha256').update(verifier).digest('hex');
}

export function getMcpLinkScopes(scopes?: string[]) {
    return scopes?.length ? scopes : [...MCP_DEFAULT_SCOPES];
}

export function getMcpLinkExpiresAt(now = Date.now()) {
    return new Date(now + MCP_LINK_TTL_MS);
}

export function createMcpLinkTokenName(clientName: string) {
    const trimmed = clientName.trim();
    return trimmed ? `MCP: ${trimmed}` : 'MCP Client';
}
