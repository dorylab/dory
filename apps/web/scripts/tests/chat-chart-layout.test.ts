import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatChartLayout, chatChartEmbed } from '@/lib/agent-runs/chat-chart-layout';

test('charts created before the answer render inside the referenced body sections, in prose order', () => {
    const text = `## Revenue\n\nRevenue rose.\n\n${chatChartEmbed('revenue')}\n\n## Orders\n\n${chatChartEmbed('orders')}\n\nOrders remained stable.`;
    const { layouts, placed } = buildChatChartLayout(['orders', 'revenue'], [{ id: 'answer', text }], 'answer');
    const parts = layouts.get('answer')!;
    assert.deepEqual(
        parts.filter(part => part.type === 'chart').map(part => part.chartId),
        ['revenue', 'orders'],
    );
    assert.equal(parts[0].type, 'text');
    assert.equal(parts.at(-1)?.type, 'text');
    assert.deepEqual([...placed], ['revenue', 'orders']);
});

test('historical chart-before-final-answer messages keep charts after their answer instead of above it', () => {
    const { layouts, placed } = buildChatChartLayout(
        ['revenue'],
        [
            { id: 'progress', text: 'I will rerun the report queries.' },
            { id: 'answer', text: 'Report updated.\n\n## Summary\nRevenue rose.' },
        ],
        'answer',
    );
    assert.deepEqual(layouts.get('progress'), [{ type: 'text', text: 'I will rerun the report queries.\n' }]);
    assert.deepEqual(layouts.get('answer')?.at(-1), { type: 'chart', chartId: 'revenue' });
    assert.deepEqual([...placed], ['revenue']);
});

test('streamed answer growth and restored saved answers preserve explicit placement without duplicate charts', () => {
    const intro = `Revenue trend:\n\n${chatChartEmbed('call/with spaces')}`;
    const initial = buildChatChartLayout(['call/with spaces'], [{ id: 'answer', text: intro }], 'answer');
    const restored = buildChatChartLayout(['call/with spaces'], [{ id: 'answer', text: `${intro}\n\nRevenue rose.\n\n${chatChartEmbed('call/with spaces')}` }], 'answer');
    assert.deepEqual(restored.layouts.get('answer')?.slice(0, 2), initial.layouts.get('answer'));
    assert.equal(restored.layouts.get('answer')?.filter(part => part.type === 'chart').length, 1);
});

test('unknown chart references never load another turn and fenced examples remain prose', () => {
    const example = `~~~markdown\n${chatChartEmbed('known')}\n~~~`;
    const text = `${example}\n\n${chatChartEmbed('other-turn')}\n\n![Chart](dory://chart/%invalid)`;
    const { layouts, placed } = buildChatChartLayout(['known'], [{ id: 'answer', text }]);
    assert.equal(placed.size, 0);
    assert.deepEqual(layouts.get('answer'), [{ type: 'text', text: `${example}\n\n\n` }]);
});

test('chart-only messages retain the standalone result when there is no answer body', () => {
    const { layouts, placed } = buildChatChartLayout(['chart'], []);
    assert.equal(layouts.size, 0);
    assert.equal(placed.size, 0);
});
