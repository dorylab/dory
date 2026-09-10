import assert from 'node:assert/strict';
import test from 'node:test';

import {
    parseSemanticYaml,
    SEMANTIC_KNOWLEDGE_SOURCE_MAX_BYTES,
    serializeSemanticModel,
    validateSemanticKnowledgeSource,
    validateSemanticModelDocument,
} from '../../src/postgres/impl/semantic-context/index';

const sources = new Set(['postgres', 'clickhouse']);

test('semantic model YAML preserves source ownership and imports definitions as unverified', () => {
    const model = validateSemanticModelDocument(
        {
            definitions: [
                { id: 'entity:orders', name: 'Orders', kind: 'entity', status: 'verified', sourceConnectionId: 'postgres', source: 'orders' },
                { id: 'metric:revenue', name: 'Revenue', kind: 'metric', status: 'verified', sourceConnectionId: 'postgres', source: 'orders', expression: 'SUM(amount)' },
            ],
        },
        sources,
    );

    const imported = parseSemanticYaml(serializeSemanticModel(model));
    assert.deepEqual(
        imported.definitions.map(definition => ({ id: definition.id, sourceConnectionId: definition.sourceConnectionId, status: definition.status })),
        [
            { id: 'entity:orders', sourceConnectionId: 'postgres', status: 'unverified' },
            { id: 'metric:revenue', sourceConnectionId: 'postgres', status: 'unverified' },
        ],
    );
    assert.equal(parseSemanticYaml(serializeSemanticModel(model), undefined, false).definitions[0]?.status, 'verified');
});

test('Cube YAML without Dory source metadata requires a selected model source', () => {
    assert.throws(() => parseSemanticYaml('cubes:\n  - name: orders\n    measures:\n      - name: revenue\n        sql: amount\n'), /data source is required/i);
    const imported = parseSemanticYaml('cubes:\n  - name: orders\n    measures:\n      - name: revenue\n        sql: amount\n', 'postgres');
    assert.equal(imported.definitions[0]?.sourceConnectionId, 'postgres');
    assert.equal(imported.definitions[0]?.status, 'unverified');
});

test('semantic validation rejects unlinked sources, unsafe filters and cross-source relationships', () => {
    assert.throws(() => validateSemanticModelDocument({ definitions: [{ id: 'metric:x', name: 'X', kind: 'metric', sourceConnectionId: 'unknown' }] }, sources), /not linked/i);
    assert.throws(
        () =>
            validateSemanticModelDocument(
                { definitions: [{ id: 'metric:x', name: 'X', kind: 'metric', sourceConnectionId: 'postgres', filters: ['paid = true; drop table orders'] }] },
                sources,
            ),
        /single expression/i,
    );
    assert.throws(
        () =>
            validateSemanticModelDocument(
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
    assert.equal(validateSemanticKnowledgeSource('rules.md', '# Revenue').format, 'markdown');
    assert.equal(validateSemanticKnowledgeSource('model.yml', 'cubes: []\n').format, 'yaml');
    assert.equal(validateSemanticKnowledgeSource('notes.txt', 'Fiscal year starts in February.').format, 'text');
    assert.throws(() => validateSemanticKnowledgeSource('rules.pdf', 'content'), /only Markdown, YAML, and TXT/i);
    assert.throws(() => validateSemanticKnowledgeSource('model.yaml', 'cubes: ['), /flow sequence|invalid YAML/i);
    assert.doesNotThrow(() => validateSemanticKnowledgeSource('large.md', 'x'.repeat(SEMANTIC_KNOWLEDGE_SOURCE_MAX_BYTES)));
    assert.throws(() => validateSemanticKnowledgeSource('large.md', 'x'.repeat(SEMANTIC_KNOWLEDGE_SOURCE_MAX_BYTES + 1)), /10 MB/i);
});
