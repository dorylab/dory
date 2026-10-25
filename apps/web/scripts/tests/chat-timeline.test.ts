import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatTimeline } from '@/lib/agent-runs/chat-timeline';
import { createLocalAgentProgressParser } from '@dory/shared/utils/local-agent-progress';
import { mergeChatProgress, type ChatProgressEntry } from '@dory/shared/types/chat-progress';

test('timeline keeps source order when tool completion and server events arrive in reverse order', () => {
    const result = buildChatTimeline(
        [
            { id: 'intro', kind: 'content', content: 'Starting' },
            { id: 'a', kind: 'tool', toolCallId: 'a' },
            { id: 'b', kind: 'tool', toolCallId: 'b' },
            { id: 'update', kind: 'content', content: 'Found a result' },
            { id: 'c', kind: 'tool', toolCallId: 'c' },
        ],
        ['a', 'b', 'c'].map(toolCallId => ({ toolCallId, toolName: 'readArtifact' })),
        [
            { eventId: 'b', toolName: 'dory_artifacts', inputSummary: { toolCallId: 'b' } },
            { eventId: 'a', toolName: 'dory_artifacts', inputSummary: { toolCallId: 'a' } },
            { eventId: 'legacy', toolName: 'dory_search_assets' },
        ],
    );
    assert.deepEqual(
        result.groups.map(group => (group.kind === 'content' ? group.content : group.activities.map(row => row.message?.toolCallId))),
        ['Starting', ['a', 'b'], 'Found a result', ['c']],
    );
    assert.equal(result.unplaced.length, 1);
});

test('public JSONL events preserve message/tool order, final identity and ignore private reasoning', () => {
    let entries: ChatProgressEntry[] = [];
    const parser = createLocalAgentProgressParser(entry => {
        entries = mergeChatProgress(entries, [entry]);
    });
    const lines =
        [
            { type: 'item.completed', item: { id: 'private', type: 'reasoning', text: 'secret' } },
            { type: 'item.completed', item: { id: 'intro', type: 'agent_message', text: '开始分析' } },
            { type: 'item.started', item: { id: 'tool', type: 'mcp_tool_call', tool: 'dory_artifacts' } },
            { type: 'item.completed', item: { id: 'tool', type: 'mcp_tool_call', tool: 'dory_artifacts', result: { structuredContent: { activityEventId: 'event-1' } } } },
            { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: '订单总数 42' } },
        ]
            .map(item => JSON.stringify(item))
            .join('\n') + '\n';
    for (let i = 0; i < lines.length; i += 7) parser.push(lines.slice(i, i + 7));
    parser.finish('订单总数 42');
    assert.deepEqual(
        entries.map(entry => entry.id),
        ['intro', 'tool', 'answer'],
    );
    assert.equal(entries[1].eventId, 'event-1');
    assert.equal(entries[1].state, 'completed');
    assert.equal(entries[2].phase, 'final');
    assert.equal(entries[0].phase, 'commentary');
    assert.deepEqual(mergeChatProgress(entries, [{ ...entries[1], revision: 1, state: 'running' }]), entries);
});

test('out-of-order progress batches are idempotent and preserve the original position', () => {
    const first: ChatProgressEntry = { id: 'a', sequence: 0, revision: 1, kind: 'text', text: 'a' };
    const second: ChatProgressEntry = { id: 'b', sequence: 1, revision: 1, kind: 'tool', state: 'running' };
    const entries = mergeChatProgress([second], [first, second]);
    assert.deepEqual(
        entries.map(entry => entry.id),
        ['a', 'b'],
    );
    assert.equal(mergeChatProgress(entries, [{ ...first, sequence: 100, revision: 2, text: 'updated' }])[0].sequence, 0);
});

test('checkpoint budget is separate, bounded, and never requires a closing summary before a final answer', async () => {
    const { initialChatCheckpoints, applyCheckpointCommand, MAX_PROGRESS_PUBLICATIONS } = await import('@dory/shared/types/chat-checkpoints');
    const state = initialChatCheckpoints();
    for (let i = 0; i < MAX_PROGRESS_PUBLICATIONS; i++) {
        assert.equal(
            applyCheckpointCommand(state, 'turn', {
                kind: 'publish',
                checkpointId: `turn:${i}`,
                text: i ? '来源中未找到对应表；我会检查下一个已授权的数据库。' : '我先查看授权数据源的数据库与表，再确定可以回答哪些内容。',
                nextStage: 'schema',
            }).published,
            true,
        );
        assert.equal(applyCheckpointCommand(state, 'turn', { kind: 'reserve', id: `a${i}`, toolName: 'exploreSchema', stage: 'schema' }).accepted, true);
        applyCheckpointCommand(state, 'turn', { kind: 'settle', id: `a${i}`, failed: false, result: 'tables: []' });
    }
    assert.equal(state.stopped, undefined); // The model may finish directly with these results.
    assert.equal(
        applyCheckpointCommand(state, 'turn', {
            kind: 'publish',
            checkpointId: `turn:${MAX_PROGRESS_PUBLICATIONS}`,
            text: '来源中仍未找到对应表，我会继续检查下一数据库。',
            nextStage: 'schema',
        }).control,
        'answer_required',
    );
});

test('preflight errors allow a corrective stage change without inventing a completed action', async () => {
    const { initialChatCheckpoints, applyCheckpointCommand } = await import('@dory/shared/types/chat-checkpoints');
    const state = initialChatCheckpoints();
    applyCheckpointCommand(state, 'turn', { kind: 'publish', checkpointId: 'turn:0', text: '我将查询最近七天的订单情况，并检查统计口径。', nextStage: 'query' });
    // A missing database is rejected before execution and before reserving an actual action.
    const result = applyCheckpointCommand(state, 'turn', {
        kind: 'publish',
        checkpointId: 'turn:1',
        text: '查询尚未执行，因为未指定数据库。接下来先查看该来源有哪些数据库。',
        nextStage: 'schema',
    });
    assert.equal(result.published, true);
    assert.deepEqual(state.entries[1].coveredActionIds, []);
    assert.equal(applyCheckpointCommand(state, 'turn', { kind: 'reserve', id: 'dbs', toolName: 'exploreSchema', stage: 'schema' }).accepted, true);
});

test('duplicate progress stays idempotent but cannot exhaust all answering opportunities', async () => {
    const { initialChatCheckpoints, applyCheckpointCommand, MAX_PROGRESS_PUBLICATIONS } = await import('@dory/shared/types/chat-checkpoints');
    const state = initialChatCheckpoints();
    const command = { kind: 'publish' as const, checkpointId: 'turn:0', text: '我先阅读订单知识的定义，再检查可查询的数据范围。', nextStage: 'reference' };
    for (let i = 0; i < MAX_PROGRESS_PUBLICATIONS + 3; i++) applyCheckpointCommand(state, 'turn', command);
    assert.equal(state.entries.length, 1);
    assert.equal(state.stopped, true);
    assert.equal(applyCheckpointCommand(state, 'turn', { kind: 'reserve', id: 'a', toolName: 'read_asset', stage: 'reference' }).control, 'answer_required');
});

test('elapsed labels use saved turn duration and never borrow timing from a later turn', async () => {
    const { chatTurnDuration, formatChatDuration } = await import('@/lib/agent-runs/chat-timeline');
    const turn = { requestId: 'current', startedAt: '2026-10-26T00:00:00Z', finishedAt: '2026-10-26T00:01:21Z' };
    assert.equal(formatChatDuration(chatTurnDuration(undefined, turn, 'current')), '1m 21s');
    assert.equal(chatTurnDuration(undefined, turn, 'older'), null);
    assert.equal(formatChatDuration(chatTurnDuration(65000, turn, 'older')), '1m 5s');
    assert.equal(formatChatDuration(500), '<1s');
    assert.equal(formatChatDuration(NaN), null);
});
