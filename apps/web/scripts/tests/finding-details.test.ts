import assert from 'node:assert/strict';
import test from 'node:test';

import { isLegacyFindingData } from '@/components/agent-runs/finding-details';

test('only legacy row dumps are recognized as expandable raw data', () => {
    const rows = 'month = 2026-01; net_revenue = 189376.21; order_count = 451\nmonth = 2026-02; net_revenue = 154578.92; order_count = 343';
    assert.equal(isLegacyFindingData(rows), true);
    assert.equal(isLegacyFindingData(rows.replace('\n', '\r\n')), true);
    assert.equal(isLegacyFindingData('provider = atlas_pay; failure_rate_pct = 36.84'), true);
    assert.equal(isLegacyFindingData(''), false);
    assert.equal(isLegacyFindingData('3 月净收入与订单数均达峰，随后净收入连续三个月回落。'), false);
    assert.equal(isLegacyFindingData('Net revenue = 189376.21; this is the January total.'), false);
    assert.equal(isLegacyFindingData(`The following rows support the conclusion:\n${rows}`), false);
    assert.equal(isLegacyFindingData('Net revenue declined.\n\nView the cited result for monthly data.'), false);
});
