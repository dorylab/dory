import type { ReactNode } from 'react';
import { mergeChatToolActivities, type ChatMessageTool, type ChatToolActivity } from './chat-tool-activity';
import type { AgentRunEventLike } from './summary';

export type ChatTimelineItem = { id: string; kind: 'content'; content: ReactNode; relatedToolCallId?: string } | { id: string; kind: 'tool'; toolCallId: string };
export type ChatTimelineGroup<T extends ChatMessageTool> = { id: string; kind: 'content'; content: ReactNode } | { id: string; kind: 'tools'; activities: ChatToolActivity<T>[] };

/** SDK messages own their streamed prose; polling must not replace it with checkpoint summaries. */
export function resolveChatTimeline<T extends ChatMessageTool>(items: ChatTimelineItem[], tools: T[], progressItems: ChatTimelineItem[], progressTools: T[]) {
    const fromMessages = !progressItems.length || items.some(item => item.kind === 'tool' || Boolean(item.relatedToolCallId));
    return fromMessages ? { items, tools, fromMessages } : { items: progressItems, tools: progressTools, fromMessages };
}

export function buildChatTimeline<T extends ChatMessageTool>(items: ChatTimelineItem[], tools: T[], events: AgentRunEventLike[]) {
    const keyed = events.filter(event => typeof event.inputSummary?.toolCallId === 'string');
    const unkeyed = events.filter(event => typeof event.inputSummary?.toolCallId !== 'string');
    const activities = [...mergeChatToolActivities(keyed, tools), ...mergeChatToolActivities(unkeyed, [])];
    const byCall = new Map(activities.filter(row => row.message).map(row => [row.message!.toolCallId, row]));
    const used = new Set<string>();
    const groups: ChatTimelineGroup<T>[] = [];
    for (const item of items) {
        if (item.kind === 'content') {
            groups.push(item);
            continue;
        }
        const activity = byCall.get(item.toolCallId);
        if (!activity || used.has(activity.id)) continue;
        used.add(activity.id);
        const prior = groups.at(-1);
        if (prior?.kind === 'tools') prior.activities.push(activity);
        else groups.push({ id: item.id, kind: 'tools', activities: [activity] });
    }
    return { groups, unplaced: activities.filter(row => !used.has(row.id)), count: activities.length };
}

/** Only use this turn's wall-clock time, never summed (possibly parallel) tools. */
export function chatTurnDuration(durationMs: unknown, turn: { requestId?: string; startedAt?: string; finishedAt?: string } | undefined, requestId: string): number | null {
    if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) return durationMs;
    if (turn?.requestId !== requestId || !turn.startedAt || !turn.finishedAt) return null;
    const duration = Date.parse(turn.finishedAt) - Date.parse(turn.startedAt);
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function formatChatDuration(durationMs: number | null): string | null {
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return null;
    if (durationMs < 1000) return '<1s';
    const seconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds % 60}s`].filter(Boolean).join(' ');
}
