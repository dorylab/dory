export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
        const { startKnowledgeConnectorWorker } = await import('./lib/server/knowledge-connector-worker');
        startKnowledgeConnectorWorker();
    }
}

export async function unregister() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { stopKnowledgeConnectorWorker } = await import('./lib/server/knowledge-connector-worker');
        stopKnowledgeConnectorWorker();
    }
}
