import assert from 'node:assert/strict';
import test from 'node:test';

import { buildResultAutoChartProfile } from '@dory/analysis/core/result-chart-profile';

test('auto-buckets dense time columns', () => {
    const rows = Array.from({ length: 72 }, (_, index) => ({
        created_at: new Date(Date.UTC(2026, 0, 1, index, 0, 0)).toISOString(),
        value: index + 1,
    }));

    const profile = buildResultAutoChartProfile({
        rows,
        columns: [
            { name: 'created_at', normalizedType: 'datetime', semanticRole: 'time' },
            { name: 'value', normalizedType: 'number', semanticRole: 'measure' },
        ],
    });

    assert.equal(profile.chartState.chartType, 'line');
    assert.match(profile.aggregated.bucketHint ?? '', /^Auto-bucketed to \d+ groups$/);
    assert.ok(profile.aggregated.data.length <= 30);
});

test('auto-buckets dense numeric columns into bins', () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({
        amount: index,
    }));

    const profile = buildResultAutoChartProfile({
        rows,
        columns: [{ name: 'amount', normalizedType: 'number', semanticRole: 'measure' }],
    });

    assert.equal(profile.chartState.chartType, 'bar');
    assert.equal(profile.aggregated.bucketHint, 'Auto-bucketed to 20 groups');
    assert.equal(profile.aggregated.data.length, 20);
});

test('keeps top category buckets and groups the long tail', () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
        segment: `segment_${index}`,
        total: 100 - index,
    }));

    const profile = buildResultAutoChartProfile({
        rows,
        columns: [
            { name: 'segment', normalizedType: 'string', semanticRole: 'dimension' },
            { name: 'total', normalizedType: 'number', semanticRole: 'measure' },
        ],
    });

    assert.equal(profile.chartState.chartType, 'bar');
    assert.equal(profile.aggregated.bucketHint, 'Auto-bucketed to 21 groups');
    assert.equal(profile.aggregated.data.length, 21);
    assert.ok(profile.aggregated.data.some(row => row.xLabel === 'Others'));
});

test('recommends expected chart states from column profile', () => {
    const timeProfile = buildResultAutoChartProfile({
        rows: [
            { created_at: '2026-01-01', total: 10 },
            { created_at: '2026-01-02', total: 12 },
        ],
        columns: [
            { name: 'created_at', normalizedType: 'date', semanticRole: 'time' },
            { name: 'total', normalizedType: 'number', semanticRole: 'measure' },
        ],
    });
    assert.equal(timeProfile.chartState.chartType, 'line');

    const dimensionProfile = buildResultAutoChartProfile({
        rows: [
            { status: 'paid', total: 10 },
            { status: 'trial', total: 3 },
        ],
        columns: [
            { name: 'status', normalizedType: 'string', semanticRole: 'dimension' },
            { name: 'total', normalizedType: 'number', semanticRole: 'measure' },
        ],
    });
    assert.equal(dimensionProfile.chartState.chartType, 'bar');

    const measureProfile = buildResultAutoChartProfile({
        rows: [{ amount: 1 }, { amount: 2 }],
        columns: [{ name: 'amount', normalizedType: 'number', semanticRole: 'measure' }],
    });
    assert.equal(measureProfile.chartState.chartType, 'bar');
});

test('falls back when explicit overrides reference missing columns', () => {
    const profile = buildResultAutoChartProfile({
        rows: [
            { status: 'paid', total: 10 },
            { status: 'trial', total: 3 },
        ],
        columns: [
            { name: 'status', normalizedType: 'string', semanticRole: 'dimension' },
            { name: 'total', normalizedType: 'number', semanticRole: 'measure' },
        ],
        overrides: {
            xKey: 'missing_dimension',
            yKey: 'sum:missing_metric',
        },
    });

    assert.equal(profile.chartState.xKey, 'status');
    assert.equal(profile.chartState.yKey, 'sum:total');
});

test('maps raw yKey overrides to canonical metric keys', () => {
    const profile = buildResultAutoChartProfile({
        rows: [
            { status: 'paid', total: 10 },
            { status: 'paid', total: 3 },
        ],
        columns: [
            { name: 'status', normalizedType: 'string', semanticRole: 'dimension' },
            { name: 'total', normalizedType: 'number', semanticRole: 'measure' },
        ],
        overrides: {
            xKey: 'status',
            yKeys: [{ key: 'total' }],
        },
    });

    assert.equal(profile.chartState.yKey, 'sum:total');
    assert.equal(profile.aggregated.data[0]?.__value__, 13);
});
