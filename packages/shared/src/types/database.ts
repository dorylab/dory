import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { ConnectionItem } from './connections';
import { TabPayload, WorkspaceScope } from './tabs';
import { ChatRepository } from './chat';
import { IAuditService } from './audit';
import { AiUsageRepository } from './ai-usage';

export interface ConnectionRepository {
    init(): Promise<void>;
    create(data: ConnectionItem): Promise<ConnectionItem>;
    readAll(userId: string): Promise<ConnectionItem[]>;
    readById(id: number, userId: string): Promise<ConnectionItem | null>;
    update(id: number, userId: string, data: Partial<ConnectionItem>): Promise<ConnectionItem>;
    delete(id: number, userId: string): Promise<void>;
}

export interface TabStateRepository<State = unknown, ResultMeta = unknown> {
    init(): Promise<void>;
    saveTabState(tab: TabPayload): Promise<void>;
    loadTabState(tabId: string, userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null): Promise<TabPayload | null>;
    loadAllTab(userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null): Promise<TabPayload[]>;
    deleteTabState(tabId: string, userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null): Promise<void>;
    clearSession(userId: string, connectionId?: string): Promise<void>;
}




export type PostgresDBClient = NodePgDatabase<any> & { $client: Pool };

export type DBClient = PostgresDBClient;

export interface IDBService<State = unknown, ResultMeta = unknown> {
    tabState: TabStateRepository<State, ResultMeta>;
    chat: ChatRepository;
    aiUsage: AiUsageRepository;
    audit: IAuditService;
    dsRepo: any;
}
