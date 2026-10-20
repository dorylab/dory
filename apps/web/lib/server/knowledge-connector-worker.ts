import 'server-only';

import { getDBService } from '@dory/database';
import { getKnowledgeConnectorSyncRunner } from './knowledge-connector-sync';
import { linearConfigured } from './linear-credentials';
import { getKnowledgeExtractionRunner } from './knowledge-extraction-worker';

const workerGlobal = globalThis as typeof globalThis & { knowledgeConnectorTimer?: ReturnType<typeof setInterval> };

export function startKnowledgeConnectorWorker() {
    if (workerGlobal.knowledgeConnectorTimer) return;
    let scanning = false;
    const scan = async () => {
        if (scanning) return;
        scanning = true;
        try {
            const db = await getDBService();
            await db.knowledge.recoverConnectorSyncJobs();
            if (linearConfigured()) await db.knowledge.queueDueLinearConnectors();
            getKnowledgeConnectorSyncRunner(db).wake();
            getKnowledgeExtractionRunner(db).wake();
        } catch {
            console.error('[knowledge-sync] Background scan failed; retrying next minute. Check database migrations and connector configuration.');
        } finally {
            scanning = false;
        }
    };
    workerGlobal.knowledgeConnectorTimer = setInterval(() => void scan(), 60_000);
    workerGlobal.knowledgeConnectorTimer.unref?.();
    void scan();
}

export function stopKnowledgeConnectorWorker() {
    clearInterval(workerGlobal.knowledgeConnectorTimer);
    delete workerGlobal.knowledgeConnectorTimer;
}
