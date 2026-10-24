import type { DynamicToolUIPart } from 'ai';

import type { AgentRunEventLike } from './summary';

export type ChatToolState = DynamicToolUIPart['state'];
export type ChatMessageTool = { toolCallId: string; toolName: string };
export type ChatToolActivity<T extends ChatMessageTool = ChatMessageTool> = {
    id: string;
    toolName: string;
    events: AgentRunEventLike[];
    message?: T;
};

export function canonicalChatToolName(name: string) {
    const aliases: Record<string, string> = {
        dory_search_assets: 'search_assets',
        search_knowledge: 'search_assets',
        dory_read_asset: 'read_asset',
        dory_run_readonly_sql: 'sqlRunner',
        dory_finish_work: 'finishAnalysis',
        dory_explore_schema: 'exploreSchema',
        dory_get_schema_graph: 'getSchemaGraph',
        dory_list_connections: 'listConnections',
        dory_artifacts: 'readArtifact',
    };
    return aliases[name] ?? name;
}

/** Use explicit call IDs, never a display title or timing, to join the two recordings. */
export function mergeChatToolActivities<T extends ChatMessageTool>(events: AgentRunEventLike[], tools: T[]): ChatToolActivity<T>[] {
    const messages = new Map(tools.map(tool => [tool.toolCallId, tool]));
    const uniqueEvents = new Map(events.map((event, index) => [event.eventId || `legacy-${index}`, event]));
    const rows = new Map<string, ChatToolActivity<T>>();
    const historicalNames = new Set<string>();
    for (const [eventId, event] of uniqueEvents) {
        const toolName = canonicalChatToolName(event.toolName ?? '');
        const callId = typeof event.inputSummary?.toolCallId === 'string' ? event.inputSummary.toolCallId : null;
        const semantic = toolName === 'semantic_model_context';
        const id = semantic ? 'semantic-model-context' : callId ? `call:${callId}` : `event:${eventId}`;
        const existing = rows.get(id);
        if (existing) existing.events.push(event);
        else rows.set(id, { id, toolName, events: [event], ...(callId && messages.has(callId) ? { message: messages.get(callId) } : {}) });
        // Old Runs have no reliable join key: replay their events, without guessing
        // which message output belongs to a particular recorded call.
        if (!callId && !semantic && event.inputSummary?.activitySource !== 'automatic') historicalNames.add(toolName);
    }
    for (const message of messages.values()) {
        const id = `call:${message.toolCallId}`;
        if (rows.has(id)) continue;
        const toolName = canonicalChatToolName(message.toolName);
        if (!historicalNames.has(toolName)) rows.set(id, { id, toolName, events: [], message });
    }
    return [...rows.values()];
}

export function chatToolActivityState(activity: ChatToolActivity, messageState?: ChatToolState): ChatToolState {
    if (messageState && ['output-available', 'output-error', 'output-denied'].includes(messageState)) return messageState;
    if (activity.toolName === 'semantic_model_context') {
        if (activity.events.some(event => event.status === 'error' || event.status === 'failed')) return 'output-error';
        if (activity.events.length && activity.events.every(event => event.status === 'success' || event.status === 'completed')) return 'output-available';
    } else {
        const terminal = [...activity.events].reverse().find(event => ['error', 'failed', 'success', 'completed'].includes(event.status ?? ''));
        if (terminal?.status === 'error' || terminal?.status === 'failed') return 'output-error';
        if (terminal) return 'output-available';
    }
    return messageState ?? 'input-available';
}
