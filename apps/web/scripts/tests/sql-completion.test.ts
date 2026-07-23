import assert from 'node:assert/strict';

import {
    normalizeTableName,
    resolveSqlCompletionFallbackContext,
    resolveTableFromAliasInSql,
} from '@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor/utils';

const sql = `SELECT
    story.id,
    story.title,
    comment.by,
    comment.text
FROM hackernews AS story
JOIN hack AS comment
    ON comment.parent = story.id
WHERE story.type = 'story'
  AND comment.type = 'comment'
LIMIT 100;`;

const offsetAfter = (value: string, occurrence = 0) => {
    let offset = -1;
    for (let index = 0; index <= occurrence; index += 1) {
        offset = sql.indexOf(value, offset + 1);
    }
    assert.notEqual(offset, -1);
    return offset + value.length;
};

assert.deepEqual(resolveSqlCompletionFallbackContext(sql, offsetAfter('JOIN hack')), {
    tablePrefix: 'hack',
    columnPrefix: null,
});
assert.deepEqual(resolveSqlCompletionFallbackContext(sql, offsetAfter('story.')), {
    tablePrefix: null,
    columnPrefix: 'story.',
});
assert.deepEqual(resolveSqlCompletionFallbackContext(sql, offsetAfter('comment.')), {
    tablePrefix: null,
    columnPrefix: 'comment.',
});
assert.equal(resolveTableFromAliasInSql(sql, 'story'), 'hackernews');
assert.equal(resolveTableFromAliasInSql(sql, 'comment'), 'hack');
assert.equal(normalizeTableName('"public"."hackernews"'), 'hackernews');
assert.equal(normalizeTableName('`default`.`hackernews`'), 'hackernews');

console.log('sql-completion tests passed');
