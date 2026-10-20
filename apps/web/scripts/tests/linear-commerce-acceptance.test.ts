import assert from 'node:assert/strict';
import test from 'node:test';

import { LINEAR_COMMERCE_UPDATE_MARKER, LINEAR_COMMERCE_UPDATED_TITLE, verifyLinearCommerceSources, type LinearCommerceSource } from '../linear-commerce/acceptance';
import { loadLinearCommerceFixtures } from '../linear-commerce/fixtures';

async function fixture() {
    const fixtures = await loadLinearCommerceFixtures();
    const spec = (id: string, title: string, contentText: string): LinearCommerceSource => ({
        id,
        connectorId: 'connector',
        connectorProvider: 'linear',
        remotePath: `${id === 'project' ? 'project' : 'document'}/${id}.md`,
        sourceUrl: `https://linear.app/dory/${id}`,
        fileName: title,
        format: 'markdown',
        contentText,
    });
    const sources = [
        spec('project', fixtures.projectName, `${fixtures.projectDescription}\n${fixtures.projectContent}`),
        ...fixtures.documents.map((doc, index) => spec(`doc-${index}`, doc.fileName, doc.content)),
    ];
    return { fixtures, sources, connectorId: 'connector', projectId: 'project', phase: 'baseline' as const };
}

test('commerce acceptance rejects truncated source bodies, wrong origins and missing sources', async () => {
    const input = await fixture();
    verifyLinearCommerceSources(input);
    const truncated = structuredClone(input);
    truncated.sources[1].contentText = truncated.sources[1].contentText.split('```sql')[0];
    assert.throws(() => verifyLinearCommerceSources(truncated), /missing fixture content/);
    const unrelated = structuredClone(input);
    unrelated.sources[1].sourceUrl = 'https://example.com/document';
    assert.throws(() => verifyLinearCommerceSources(unrelated), /original URL/);
    assert.throws(() => verifyLinearCommerceSources({ ...input, sources: input.sources.slice(1) }), /source count/);
});

test('commerce acceptance checks stable IDs after rename and keeps source text out of reports', async () => {
    const input = await fixture();
    const baseline = verifyLinearCommerceSources(input);
    const updated = structuredClone(input);
    updated.sources[1].fileName = LINEAR_COMMERCE_UPDATED_TITLE;
    updated.sources[1].contentText += `\n${LINEAR_COMMERCE_UPDATE_MARKER}`;
    const evidence = verifyLinearCommerceSources({ ...updated, phase: 'updated', baselineIds: baseline.sourceIdsByRemotePath });
    assert.equal('contentText' in evidence.sources[0], false);
    assert.equal(JSON.stringify(evidence).includes('net_amount - refunded_amount'), false);
    updated.sources[1].id = 'duplicate-new-id';
    assert.throws(() => verifyLinearCommerceSources({ ...updated, phase: 'updated', baselineIds: baseline.sourceIdsByRemotePath }), /identity changed/);
});

test('commerce lifecycle acceptance keeps an empty document identity and requires cleanup after deletion', async () => {
    const input = await fixture();
    const temporary: LinearCommerceSource = {
        id: 'temporary',
        connectorId: 'connector',
        connectorProvider: 'linear',
        remotePath: 'document/temporary.md',
        sourceUrl: 'https://linear.app/dory/temporary',
        fileName: '临时生命周期测试.md',
        format: 'markdown',
        contentText: 'DORY_LINEAR_COMMERCE_TEMP_V1',
    };
    const added = verifyLinearCommerceSources({ ...input, sources: [...input.sources, temporary], phase: 'temporary' });
    const empty = { ...temporary, contentText: '# 临时生命周期测试.md\nSource: https://linear.app/dory/temporary' };
    verifyLinearCommerceSources({
        ...input,
        sources: [...input.sources, empty],
        phase: 'empty',
        baselineIds: added.sourceIdsByRemotePath,
        temporaryRemotePath: temporary.remotePath!,
    });
    assert.throws(
        () =>
            verifyLinearCommerceSources({
                ...input,
                sources: [...input.sources, { ...empty, id: 'recreated' }],
                phase: 'empty',
                baselineIds: added.sourceIdsByRemotePath,
                temporaryRemotePath: temporary.remotePath!,
            }),
        /identity changed/,
    );
    verifyLinearCommerceSources({ ...input, phase: 'deleted', temporaryRemotePath: temporary.remotePath! });
    assert.throws(
        () => verifyLinearCommerceSources({ ...input, sources: [...input.sources, temporary], phase: 'deleted', temporaryRemotePath: temporary.remotePath! }),
        /source count/,
    );
});
