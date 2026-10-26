import type { DBService } from '@dory/database';
import type { ChatSessionRecord } from '@dory/shared';
import type { AgentWorkOutput, AgentWorkSummary } from '@dory/shared/types/agent-work';

import { workCounts, workStatus } from '@/lib/work-documents/work-summary';

export async function listAgentWorks(db: DBService, owner: { organizationId: string; userId: string }, sessions: ChatSessionRecord[]): Promise<AgentWorkSummary[]> {
    const sources = await db.chat.listWorkSources(
        owner,
        sessions.map(session => session.id),
    );
    return sessions
        .map(session => {
            const messages = sources.messages.filter(message => message.chatId === session.id);
            const runIds = new Set(messages.map(message => message.runId));
            const runs = sources.runs.filter(run => run.externalSessionId === `chat:${session.id}` || run.metadata?.chatId === session.id || runIds.has(run.id));
            runs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            const outputs = new Map<string, AgentWorkOutput>();
            const times = [session.updatedAt, session.lastMessageAt ?? session.createdAt, ...runs.map(run => run.updatedAt)];
            for (const report of sources.reports.filter(report => report.chatId === session.id)) {
                times.push(report.updatedAt);
                outputs.set(report.id, {
                    id: report.id,
                    title: report.title,
                    type: 'report',
                    available: report.status === 'ready',
                    origin: { kind: 'report', documentId: report.id },
                });
                for (const visual of report.visuals.filter(visual => visual.type === 'chart')) {
                    const id = `${report.id}:${visual.id}`;
                    outputs.set(id, {
                        id,
                        title: visual.title,
                        type: 'chart',
                        available: report.status === 'ready',
                        origin: { kind: 'report', documentId: report.id, visualId: visual.id },
                    });
                }
            }
            for (const artifact of sources.artifacts.filter(artifact => runs.some(run => run.id === artifact.workId || run.id === artifact.agentRunId))) {
                if (artifact.type === 'result_set' && artifact.resultStatus !== 'success') continue;
                times.push(artifact.updatedAt);
                const id = artifact.type === 'result_set' ? `result:${artifact.sourceResultSetId ?? artifact.resourceId}` : artifact.id;
                outputs.set(id, {
                    id,
                    title: artifact.title,
                    type: artifact.type === 'chart' ? 'chart' : 'result',
                    available:
                        artifact.status === 'ready' &&
                        artifact.resultStatus === 'success' &&
                        artifact.dataAvailability !== 'none' &&
                        (!artifact.expiresAt || artifact.expiresAt.getTime() > Date.now()) &&
                        (!artifact.resultExpiresAt || artifact.resultExpiresAt.getTime() > Date.now()),
                    origin: { kind: 'artifact', artifactId: artifact.id },
                });
            }
            for (const message of messages)
                for (const chart of message.charts) {
                    if (!chart.available) continue;
                    const id = `${message.id}:${chart.toolCallId}`;
                    outputs.set(id, {
                        id,
                        title: chart.title || 'Chart',
                        type: 'chart',
                        available: true,
                        origin: { kind: 'message', messageId: message.id, toolCallId: chart.toolCallId },
                    });
                }
            const items = [...outputs.values()];
            return {
                id: session.id,
                title: session.title,
                titlePending: ['pending', 'generating'].includes(String(session.metadata?.workTitleSource)),
                status: workStatus(runs[0]?.status, runs[0]?.metadata ?? null),
                updatedAt: new Date(Math.max(...times.map(time => time.getTime()))).toISOString(),
                counts: workCounts(items),
                outputs: items,
            };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
