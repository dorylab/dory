import assert from 'node:assert/strict';
import test from 'node:test';

import {
    parseKnowledgeYaml,
    KNOWLEDGE_SOURCE_MAX_BYTES,
    serializeKnowledgeModel,
    validateKnowledgeSource,
    validateKnowledgeModelDocument,
} from '../../src/postgres/impl/knowledge/index';

const sources = new Set(['postgres', 'clickhouse']);

test('knowledge model YAML preserves source ownership and imports definitions as unverified', () => {
    const model = validateKnowledgeModelDocument(
        {
            definitions: [
                { id: 'entity:orders', name: 'Orders', kind: 'entity', status: 'verified', sourceConnectionId: 'postgres', source: 'orders' },
                { id: 'metric:revenue', name: 'Revenue', kind: 'metric', status: 'verified', sourceConnectionId: 'postgres', source: 'orders', expression: 'SUM(amount)' },
            ],
        },
        sources,
    );

    const imported = parseKnowledgeYaml(serializeKnowledgeModel(model));
    assert.deepEqual(
        imported.definitions.map(definition => ({ id: definition.id, sourceConnectionId: definition.sourceConnectionId, status: definition.status })),
        [
            { id: 'entity:orders', sourceConnectionId: 'postgres', status: 'unverified' },
            { id: 'metric:revenue', sourceConnectionId: 'postgres', status: 'unverified' },
        ],
    );
    assert.equal(parseKnowledgeYaml(serializeKnowledgeModel(model), undefined, false).definitions[0]?.status, 'verified');
});

test('Cube YAML without Dory source metadata requires a selected model source', () => {
    assert.throws(() => parseKnowledgeYaml('cubes:\n  - name: orders\n    measures:\n      - name: revenue\n        sql: amount\n'), /data source is required/i);
    const imported = parseKnowledgeYaml('cubes:\n  - name: orders\n    measures:\n      - name: revenue\n        sql: amount\n', 'postgres');
    assert.equal(imported.definitions[0]?.sourceConnectionId, 'postgres');
    assert.equal(imported.definitions[0]?.status, 'unverified');
});

test('knowledge validation rejects unlinked sources, unsafe filters and cross-source relationships', () => {
    assert.throws(() => validateKnowledgeModelDocument({ definitions: [{ id: 'metric:x', name: 'X', kind: 'metric', sourceConnectionId: 'unknown' }] }, sources), /not linked/i);
    assert.throws(
        () =>
            validateKnowledgeModelDocument(
                { definitions: [{ id: 'metric:x', name: 'X', kind: 'metric', sourceConnectionId: 'postgres', filters: ['paid = true; drop table orders'] }] },
                sources,
            ),
        /single expression/i,
    );
    assert.throws(
        () =>
            validateKnowledgeModelDocument(
                {
                    definitions: [
                        { id: 'entity:orders', name: 'Orders', kind: 'entity', sourceConnectionId: 'postgres' },
                        { id: 'entity:customers', name: 'Customers', kind: 'entity', sourceConnectionId: 'clickhouse' },
                        { id: 'relationship:customer', name: 'Orders to Customer', kind: 'relationship', sourceConnectionId: 'postgres', from: 'Orders', to: 'Customers' },
                    ],
                },
                sources,
            ),
        /cannot cross data sources/i,
    );
});

test('knowledge sources validate supported text formats, size and YAML syntax', () => {
    assert.equal(validateKnowledgeSource('rules.md', '# Revenue').format, 'markdown');
    assert.equal(validateKnowledgeSource('model.yml', 'cubes: []\n').format, 'yaml');
    assert.equal(validateKnowledgeSource('notes.txt', 'Fiscal year starts in February.').format, 'text');
    assert.throws(() => validateKnowledgeSource('rules.pdf', 'content'), /only Markdown, YAML, and TXT/i);
    assert.throws(() => validateKnowledgeSource('model.yaml', 'cubes: ['), /flow sequence|invalid YAML/i);
    assert.doesNotThrow(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES)));
    assert.throws(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES + 1)), /10 MB/i);
});
