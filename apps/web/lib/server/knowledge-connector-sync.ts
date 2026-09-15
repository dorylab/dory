import 'server-only';

import type { DBService } from '@dory/database';
import { isDesktopRuntime } from '@dory/shared/runtime';
import { readGitHubConnectorSnapshot } from './github-connector';

const runners = new WeakMap<DBService, KnowledgeConnectorSyncRunner>();

export class KnowledgeConnectorSyncRunner {
    private running = false;
    private wakeRequested = false;

    constructor(private readonly db: DBService) {}

    wake() {
        this.wakeRequested = true;
        if (this.running) return;
        this.running = true;
        void this.drain();
    }

    private async drain() {
        try {
            do {
                this.wakeRequested = false;
                for (;;) {
                    const job = await this.db.knowledge.claimConnectorSyncJob();
                    if (!job) break;
                    try {
                        const connector = await this.db.knowledge.getConnectorById(job.connectorId);
                        const snapshot = await readGitHubConnectorSnapshot(connector);
                        await this.db.knowledge.applyConnectorSnapshot({ connectorId: connector.id, ...snapshot });
                        await this.db.knowledge.finishConnectorSyncJob({ jobId: job.id, connectorId: connector.id });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'GitHub synchronization failed.';
                        await this.db.knowledge.finishConnectorSyncJob({ jobId: job.id, connectorId: job.connectorId, error: message });
                    }
                }
            } while (this.wakeRequested);
        } finally {
            this.running = false;
        }
    }
}

export function getKnowledgeConnectorSyncRunner(db: DBService) {
    let runner = runners.get(db);
    if (!runner) {
        runner = new KnowledgeConnectorSyncRunner(db);
        runners.set(db, runner);
    }
    return runner;
}

type GitHubWebhookPayload = {
    action?: string;
    ref?: string;
    after?: string;
    installation?: { id?: number };
    repository?: { id?: number; default_branch?: string };
    repositories_removed?: Array<{ id: number }>;
};

export async function handleGitHubConnectorWebhook(db: DBService, event: string, payload: GitHubWebhookPayload) {
    if (isDesktopRuntime()) return;
    const installationId = payload.installation?.id ? String(payload.installation.id) : '';
    if (!installationId) return;
    if (event === 'installation' && payload.action === 'deleted') {
        await db.knowledge.disableConnectors({ installationId });
        return;
    }
    if (event === 'installation_repositories' && payload.action === 'removed') {
        const ids = payload.repositories_removed?.map(repository => String(repository.id)) ?? [];
        if (ids.length) await db.knowledge.disableConnectors({ installationId, repositoryIds: ids });
        return;
    }
    if (event !== 'push' || !payload.repository?.id || !payload.repository.default_branch) return;
    if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return;
    const connectors = await db.knowledge.findConnectorsByGitHubRepository({ installationId, repositoryId: String(payload.repository.id) });
    for (const connector of connectors.filter(item => item.status !== 'disabled' && item.defaultBranch === payload.repository?.default_branch)) {
        await db.knowledge.queueConnectorSync({ connectorId: connector.id, targetSha: payload.after });
    }
    if (connectors.length) getKnowledgeConnectorSyncRunner(db).wake();
}
