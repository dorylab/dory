import assert from 'node:assert/strict';
import test from 'node:test';

import { knowledgeSourceDisplayName } from '../../src/utils/knowledge-source-name';

const linearUrl = 'https://linear.app/jeffreyh/document/original-2cbbb814ad98';
const legacyTitle = '运营日历与异常说明.md · 573ac374 · 7ebfe93b-7374-4f85-acd3-c2c91d764c25.md';

test('removes only generated connector identifiers from knowledge titles', () => {
    assert.equal(
        knowledgeSourceDisplayName({
            fileName: legacyTitle,
            connectorProvider: 'linear',
            connectorId: 'kco_01a15859-05b2-757f-b4a5-160573ac374',
            remotePath: 'document/7ebfe93b-7374-4f85-acd3-c2c91d764c25.md',
            sourceUrl: linearUrl,
        }),
        '运营日历与异常说明.md',
    );
    assert.equal(knowledgeSourceDisplayName({ fileName: legacyTitle, sourceUrl: linearUrl }), '运营日历与异常说明.md');
    assert.equal(
        knowledgeSourceDisplayName({
            fileName: 'dorylab/docs · docs › readme.md · nector-1',
            connectorProvider: 'github',
            connectorId: 'connector-1',
        }),
        'dorylab/docs · docs › readme.md',
    );
    assert.equal(knowledgeSourceDisplayName({ fileName: 'My notes · 573ac374.md' }), 'My notes · 573ac374.md');
    assert.equal(knowledgeSourceDisplayName({ fileName: '运营日历与异常说明.md' }), '运营日历与异常说明.md');
});
