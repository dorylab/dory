import { joinObjectPath, readableToBuffer, safeObjectPathPart, type ObjectStore } from './object-store';

export type AgentRunArtifactRef = {
    store: 'filesystem' | 's3' | (string & {});
    organizationId: string;
    agentRunId: string;
    basePath: string;
    eventsPath: string;
};

export class AgentRunArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly prefix = 'artifacts',
    ) {}

    ref(organizationId: string, agentRunId: string): AgentRunArtifactRef {
        return {
            store: this.objectStore.kind,
            organizationId,
            agentRunId,
            basePath: this.basePath(organizationId, agentRunId),
            eventsPath: 'events.jsonl',
        };
    }

    async appendEvent(ref: AgentRunArtifactRef, event: unknown): Promise<void> {
        const objectPath = joinObjectPath(ref.basePath, ref.eventsPath);
        const line = `${JSON.stringify(event)}\n`;
        const existing = (await this.objectStore.exists(objectPath)) ? await readableToBuffer(await this.objectStore.get(objectPath)) : Buffer.alloc(0);
        await this.objectStore.put(objectPath, Buffer.concat([existing, Buffer.from(line, 'utf8')]), { contentType: 'application/x-ndjson' });
    }

    async *readEvents(ref: AgentRunArtifactRef): AsyncIterable<unknown> {
        const objectPath = joinObjectPath(ref.basePath, ref.eventsPath);
        if (!(await this.objectStore.exists(objectPath))) return;
        const body = await readableToBuffer(await this.objectStore.get(objectPath));
        for (const line of body.toString('utf8').split('\n')) {
            if (!line.trim()) continue;
            yield JSON.parse(line);
        }
    }

    async deleteAgentRun(ref: AgentRunArtifactRef): Promise<void> {
        await this.objectStore.deletePrefix(ref.basePath);
    }

    basePath(organizationId: string, agentRunId: string) {
        return joinObjectPath(this.prefix, organizationPathPart(organizationId), 'agent-runs', safeObjectPathPart(agentRunId));
    }
}

function organizationPathPart(organizationId: string) {
    const safe = safeObjectPathPart(organizationId);
    return safe.startsWith('org_') ? safe : `org_${safe}`;
}
