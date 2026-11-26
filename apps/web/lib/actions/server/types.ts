import type { KnowledgeAccess } from '@/lib/server/knowledge-access';
import type { NextRequest } from 'next/server';
import type { DBService } from '@dory/database';

export type WebActionServices = {
    db: DBService;
    knowledgeAccess?: KnowledgeAccess;
    agentEventId?: string;
    agentToolCallId?: string;
    agentActivitySource?: 'automatic' | 'tool';
    agentTurn?: { workId: string; requestId: string; responseMessageId: string };
    req?: NextRequest;
    requestOrigin?: string | null;
    workspaceOrigin?: string | null;
    defer?: (task: () => Promise<void> | void) => void;
};
