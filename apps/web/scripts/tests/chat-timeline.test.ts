import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatTimeline, resolveChatTimeline, type ChatTimelineItem } from '@/lib/agent-runs/chat-timeline';
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

test('inline charts keep their original positions as later text and charts arrive and progress collapses', () => {
    const tools = ['chart-1', 'chart-2'].map(toolCallId => ({ toolCallId, toolName: 'chartBuilder' }));
    const first: ChatTimelineItem[] = [
        { id: 'progress', kind: 'content', content: 'Building the revenue chart.' },
        { id: 'intro', kind: 'content', content: 'Monthly revenue:', persistent: true },
        { id: 'tool-1', kind: 'tool', toolCallId: 'chart-1' },
        { id: 'chart-1', kind: 'content', content: 'revenue chart', relatedToolCallId: 'chart-1', persistent: true },
    ];
    const later: ChatTimelineItem[] = [
        ...first,
        { id: 'second-intro', kind: 'content', content: 'Monthly orders:', persistent: true },
        { id: 'tool-2', kind: 'tool', toolCallId: 'chart-2' },
        { id: 'chart-2', kind: 'content', content: 'orders chart', relatedToolCallId: 'chart-2', persistent: true },
        { id: 'answer', kind: 'content', content: 'Revenue and orders rose together.', persistent: true },
    ];
    const initial = buildChatTimeline(first, tools.slice(0, 1), []);
    const resolved = resolveChatTimeline(later, tools, [{ id: 'poll', kind: 'content', content: 'Charts completed.' }], []);
    const completed = buildChatTimeline(resolved.items, resolved.tools, []);
    assert.deepEqual(completed.groups.slice(0, initial.groups.length), initial.groups);
    assert.deepEqual(
        completed.groups.filter(group => group.kind === 'content' && group.persistent).map(group => group.id),
        ['intro', 'chart-1', 'second-intro', 'chart-2', 'answer'],
    );
    assert.equal(
        completed.groups.find(group => group.id === 'chart-1'),
        first[3],
    );
    assert.deepEqual(completed.unplaced, []);
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

test('checkpoint polling cannot remove streamed SDK text or replace SDK tool identities', () => {
    const intro: ChatTimelineItem = { id: 'intro', kind: 'content', content: 'I will inspect the order data.' };
    const publication: ChatTimelineItem = { id: 'plan', kind: 'content', content: 'Checking the order schema.', relatedToolCallId: 'publish-1' };
    const checkpointItems: ChatTimelineItem[] = [{ id: 'checkpoint-plan', kind: 'content', content: 'Checking the order schema.' }];
    const first = resolveChatTimeline([intro, publication], [], checkpointItems, []);
    assert.deepEqual(
        buildChatTimeline(first.items, first.tools, []).groups.map(group => group.kind === 'content' && group.content),
        [intro.content, publication.content],
    );

    const tools = [
        { toolCallId: 'schema-sdk', toolName: 'exploreSchema' },
        { toolCallId: 'sql-sdk', toolName: 'sqlRunner' },
    ];
    const messages: ChatTimelineItem[] = [
        intro,
        publication,
        { id: 'schema', kind: 'tool', toolCallId: 'schema-sdk' },
        { id: 'update', kind: 'content', content: 'The schema is confirmed. Querying monthly revenue.' },
        { id: 'sql', kind: 'tool', toolCallId: 'sql-sdk' },
    ];
    const progressTools = tools.map((tool, i) => ({ ...tool, toolCallId: `checkpoint-${i}` }));
    const later = resolveChatTimeline(messages, tools, [...checkpointItems, { id: 'checkpoint-0', kind: 'tool', toolCallId: 'checkpoint-0' }], progressTools);
    const result = buildChatTimeline(later.items, later.tools, [
        { eventId: 'schema-event', toolName: 'dory_explore_schema', inputSummary: { toolCallId: 'schema-sdk' } },
        { eventId: 'sql-event', toolName: 'dory_run_readonly_sql', inputSummary: { toolCallId: 'sql-sdk' } },
    ]);
    assert.equal(later.fromMessages, true);
    assert.deepEqual(
        result.groups.map(group => (group.kind === 'content' ? group.content : group.activities.map(activity => activity.message?.toolCallId))),
        [intro.content, publication.content, ['schema-sdk'], 'The schema is confirmed. Querying monthly revenue.', ['sql-sdk']],
    );
    assert.deepEqual(result.unplaced, []);
});

test('local agents retain their server progress timeline when no SDK tool stream exists', () => {
    const progress: ChatTimelineItem[] = [
        { id: 'plan', kind: 'content', content: 'Reading the saved query.' },
        { id: 'read', kind: 'tool', toolCallId: 'mcp-read' },
    ];
    const tools = [{ toolCallId: 'mcp-read', toolName: 'readArtifact' }];
    const result = resolveChatTimeline([], [], progress, tools);
    assert.equal(result.fromMessages, false);
    assert.deepEqual(result.items, progress);
    assert.deepEqual(result.tools, tools);
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
