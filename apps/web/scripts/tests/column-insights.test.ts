import assert from 'node:assert/strict';
import { generateColumnInsights } from '@/lib/schema/column-insights';

const insights = generateColumnInsights(
    [
        { name: 'price', type: 'UInt32', nullable: true },
        { name: 'date', type: 'Date', nullable: true },
        { name: 'postcode1', type: 'LowCardinality(String)', nullable: true },
        { name: 'type', type: "Enum8('other' = 0, 'known' = 1)", nullable: true },
        { name: 'is_new', type: 'UInt8', nullable: true },
    ],
    'en',
);

function tagsFor(column: string) {
    return insights.tags[column] ?? [];
}

assert.deepEqual(tagsFor('price'), ['amount', 'numeric']);
assert.deepEqual(tagsFor('date'), ['time', 'date']);
assert.deepEqual(tagsFor('postcode1'), ['geo', 'identifier', 'low-cardinality']);
assert.deepEqual(tagsFor('is_new'), ['boolean', 'status']);

const typeTags = tagsFor('type');
assert.ok(typeTags.includes('dimension'));
assert.ok(typeTags.includes('enum'));
assert.ok(typeTags.includes('low-cardinality'));

for (const column of ['price', 'date', 'postcode1', 'type', 'is_new']) {
    assert.ok(insights.summaries[column]?.length, `${column} should have a summary`);
}

console.log('column-insights tests passed');
