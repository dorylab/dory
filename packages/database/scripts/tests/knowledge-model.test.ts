import assert from 'node:assert/strict';
import test from 'node:test';
import { validateKnowledgeSource, KNOWLEDGE_SOURCE_MAX_BYTES } from '../../src/postgres/impl/knowledge';

test('knowledge sources validate supported text formats, and size', () => {
    assert.equal(validateKnowledgeSource('rules.md', '# Revenue').format, 'markdown');
    assert.equal(validateKnowledgeSource('model.yml', 'name: Payroll').format, 'yaml');
    assert.equal(validateKnowledgeSource('notes.txt', 'Fiscal year starts in February.').format, 'text');
    assert.throws(() => validateKnowledgeSource('rules.pdf', 'content'), /only Markdown, YAML, and TXT/i);
    assert.equal(validateKnowledgeSource('model.yaml', 'unfinished: [').contentText, 'unfinished: [');
    assert.doesNotThrow(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES)));
    assert.throws(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES + 1)), /10 MB/i);
});
