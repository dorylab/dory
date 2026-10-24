import assert from 'node:assert/strict';
import test from 'node:test';

import { chatToolActivityState, mergeChatToolActivities } from '@/lib/agent-runs/chat-tool-activity';
import type { AgentRunEventLike } from '@/lib/agent-runs/summary';

const event = (eventId: string, toolName: string, toolCallId?: string, status = 'success'): AgentRunEventLike => ({
    eventId,
    toolName,
    status,
    inputSummary: { ...(toolCallId ? { toolCallId } : {}) },
});

test('polling joins SDK tools to their event and preserves the row key', () => {
    const tools = [{ toolCallId: 'sql-1', toolName: 'sqlRunner', marker: 'rich result' }];
    const before = mergeChatToolActivities([], tools);
    const after = mergeChatToolActivities([event('event-1', 'dory_run_readonly_sql', 'sql-1')], tools);
    assert.equal(after.length, 1);
    assert.equal(after[0]?.id, before[0]?.id);
    assert.equal(after[0]?.message?.marker, 'rich result');
    assert.equal(after[0]?.toolName, 'sqlRunner');
});

test('event updates and repeated callbacks cannot duplicate a call', () => {
    const rows = mergeChatToolActivities(
        [event('event-1', 'dory_read_asset', 'read', 'running'), event('event-1', 'dory_read_asset', 'read'), event('event-2', 'dory_read_asset', 'read')],
        [{ toolCallId: 'read', toolName: 'read_asset' }],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.events.length, 2);
    assert.equal(chatToolActivityState(rows[0]!), 'output-available');
});

test('repeated searches are separate calls and automatic discovery does not hide an SDK search', () => {
    const automatic = { ...event('automatic', 'dory_search_assets'), inputSummary: { activitySource: 'automatic' } };
    const tools = [
        { toolCallId: 'first', toolName: 'search_assets' },
        { toolCallId: 'second', toolName: 'search_assets' },
    ];
    const rows = mergeChatToolActivities([automatic, event('first-event', 'dory_search_assets', 'first')], tools);
    assert.deepEqual(
        rows.map(row => row.id),
        ['event:automatic', 'call:first', 'call:second'],
    );
});

test('multiple loaded semantic models form one step retaining every source and revision', () => {
    const events = ['model-1', 'model-2'].map(id => ({
        ...event(id, 'semantic_model_context'),
        inputSummary: { knowledgeModelId: id },
        outputSummary: { modelRevision: `revision-${id}` },
    }));
    const rows = mergeChatToolActivities(events, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.events.length, 2);
    assert.equal(rows[0]?.events[1]?.outputSummary?.modelRevision, 'revision-model-2');
});

test('old Runs replay authoritative events without guessing message-event pairs', () => {
    const rows = mergeChatToolActivities([event('old-a', 'dory_run_readonly_sql'), event('old-b', 'dory_run_readonly_sql')], [{ toolCallId: 'old-sdk', toolName: 'sqlRunner' }]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => !row.message));
    assert.equal(mergeChatToolActivities([], [{ toolCallId: 'historical', toolName: 'sqlRunner' }]).length, 1);
});

test('terminal SDK results win over a stale running event; terminal events supplement a pending SDK call', () => {
    const rows = mergeChatToolActivities([event('a', 'dory_read_asset', 'read', 'running')], [{ toolCallId: 'read', toolName: 'read_asset' }]);
    assert.equal(chatToolActivityState(rows[0]!, 'output-available'), 'output-available');
    rows[0]!.events[0]!.status = 'error';
    assert.equal(chatToolActivityState(rows[0]!, 'input-available'), 'output-error');
    rows[0]!.events.push(event('retry', 'dory_read_asset', 'read'));
    assert.equal(chatToolActivityState(rows[0]!, 'input-available'), 'output-available');
});
