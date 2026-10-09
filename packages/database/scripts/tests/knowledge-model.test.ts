import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getKnowledgeReadiness,
    KNOWLEDGE_SOURCE_MAX_BYTES,
    parseKnowledgeSourceYaml,
    parseKnowledgeYaml,
    serializeKnowledgeModel,
    validateKnowledgeModelDocument,
    validateKnowledgeSource,
} from '../../src/postgres/impl/knowledge/index';
import {
    applyKnowledgeDefinitions,
    ossieRevision,
    parseOssieYaml,
    projectOssieDocument,
    serializeOssieDocument,
    updateOssieMetadata,
    validateOssieDocument,
} from '../../src/postgres/impl/knowledge/ossie';

const sources = new Set(['postgres', 'clickhouse']);
const ossieDocument = {
    version: '0.1.1' as const,
    semantic_model: [
        {
            name: 'commerce',
            ai_context: { instructions: 'Revenue excludes tax.', synonyms: ['sales'], examples: ['Show revenue by customer.'] },
            datasets: [
                {
                    name: 'orders',
                    source: 'public.orders',
                    fields: [
                        { name: 'customer_id', expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'customer_id' }] } },
                        {
                            name: 'amount',
                            expression: {
                                dialects: [
                                    { dialect: 'ANSI_SQL' as const, expression: 'amount' },
                                    { dialect: 'SNOWFLAKE' as const, expression: '"AMOUNT"' },
                                ],
                            },
                        },
                    ],
                    custom_extensions: [
                        { vendor_name: 'COMMON' as const, data: JSON.stringify({ dory: { id: 'entity:orders', status: 'verified', sourceConnectionId: 'postgres' } }) },
                    ],
                },
                {
                    name: 'customers',
                    source: 'public.customers',
                    fields: [{ name: 'id', expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'id' }] } }],
                    custom_extensions: [
                        { vendor_name: 'COMMON' as const, data: JSON.stringify({ dory: { id: 'entity:customers', status: 'verified', sourceConnectionId: 'postgres' } }) },
                    ],
                },
            ],
            metrics: [
                {
                    name: 'revenue',
                    expression: {
                        dialects: [
                            { dialect: 'ANSI_SQL' as const, expression: 'SUM(orders.amount)' },
                            { dialect: 'SNOWFLAKE' as const, expression: 'SUM(orders."AMOUNT")' },
                        ],
                    },
                    ai_context: { synonyms: ['sales'], examples: ['Revenue by month'] },
                    custom_extensions: [
                        { vendor_name: 'COMMON' as const, data: JSON.stringify({ dory: { id: 'metric:revenue', status: 'verified', sourceConnectionId: 'postgres' } }) },
                        { vendor_name: 'SNOWFLAKE' as const, data: JSON.stringify({ warehouse: 'ANALYTICS' }) },
                    ],
                },
            ],
            relationships: [
                {
                    name: 'order_customer',
                    from: 'orders',
                    to: 'customers',
                    from_columns: ['customer_id'],
                    to_columns: ['id'],
                    custom_extensions: [
                        {
                            vendor_name: 'COMMON' as const,
                            data: JSON.stringify({ dory: { id: 'relationship:order_customer', status: 'verified', sourceConnectionId: 'postgres' } }),
                        },
                    ],
                },
            ],
        },
    ],
};

test('knowledge readiness requires connected data and a verified non-relationship definition', () => {
    const verifiedMetric = { id: 'metric:revenue', name: 'Revenue', kind: 'metric' as const, status: 'verified' as const, sourceConnectionId: 'postgres' };
    assert.equal(getKnowledgeReadiness([verifiedMetric], 1).status, 'ready');
    assert.equal(getKnowledgeReadiness([verifiedMetric], 0).status, 'not_ready');
    assert.equal(getKnowledgeReadiness([{ ...verifiedMetric, status: 'unverified' }], 1).status, 'not_ready');
});

test('Ossie YAML round-trips dialects, AI context and extensions with a formatting-independent revision', () => {
    const yaml = serializeOssieDocument(ossieDocument);
    const parsed = parseOssieYaml(yaml);
    assert.deepEqual(parsed, ossieDocument);
    assert.equal(ossieRevision(parsed), ossieRevision(parseOssieYaml(`\n${yaml}\n`)));
    assert.equal(parsed.semantic_model[0].metrics?.[0]?.expression.dialects.length, 2);
});

test('Ossie projection preserves source ownership and marks imports unverified', () => {
    const yaml = serializeOssieDocument(ossieDocument);
    const imported = parseKnowledgeYaml(yaml);
    assert.ok(imported.definitions.every(definition => definition.status === 'unverified'));
    assert.equal(imported.definitions.find(definition => definition.name === 'revenue')?.sourceConnectionId, 'postgres');
    assert.equal(parseKnowledgeYaml(yaml, undefined, false).definitions[0]?.status, 'verified');
    assert.equal(parseKnowledgeSourceYaml(yaml).verifiedQueries.length, 0);
});

test('UI projection serializes as Ossie 0.1.1', () => {
    const projected = parseKnowledgeYaml(serializeOssieDocument(ossieDocument), undefined, false);
    const serialized = parseOssieYaml(serializeKnowledgeModel(projected));
    assert.equal(serialized.version, '0.1.1');
    assert.equal(serialized.semantic_model.length, 1);
    assert.equal(serialized.semantic_model[0].relationships?.[0]?.from_columns[0], 'customer_id');
});

test('UI patch preserves hidden dialects, AI context and custom extensions', () => {
    const projected = projectOssieDocument(ossieDocument);
    const definitions = projected.definitions.map(definition =>
        definition.name === 'revenue' ? { ...definition, expression: 'SUM(orders.amount) FILTER (WHERE orders.amount > 0)' } : definition,
    );
    const patched = applyKnowledgeDefinitions(ossieDocument, definitions);
    const revenue = patched.semantic_model[0].metrics?.find(metric => metric.name === 'revenue');
    assert.equal(revenue?.expression.dialects.find(item => item.dialect === 'SNOWFLAKE')?.expression, 'SUM(orders."AMOUNT")');
    assert.deepEqual(revenue?.ai_context, ossieDocument.semantic_model[0].metrics[0].ai_context);
    assert.equal(
        revenue?.custom_extensions?.some(extension => extension.vendor_name === 'SNOWFLAKE'),
        true,
    );
});

test('model AI context patch preserves unknown external keys', () => {
    const source = structuredClone(ossieDocument);
    source.semantic_model[0].ai_context = { ...source.semantic_model[0].ai_context, audience: 'finance' };
    const patched = updateOssieMetadata(source, { aiContext: { synonyms: ['bookings'], examples: [] } });
    assert.deepEqual(patched.semantic_model[0].ai_context, {
        instructions: 'Revenue excludes tax.',
        synonyms: ['bookings'],
        examples: [],
        audience: 'finance',
    });
});

test('Ossie validation rejects unsupported and structurally invalid documents', () => {
    assert.throws(() => parseOssieYaml('cubes: []\n'), /no longer supported|Ossie 0\.1\.1/i);
    assert.throws(() => validateOssieDocument({ ...ossieDocument, version: '0.2.0.dev0' }), /0\.1\.1/i);
    assert.throws(() => validateOssieDocument({ ...ossieDocument, semantic_model: [...ossieDocument.semantic_model, ossieDocument.semantic_model[0]] }), /exactly one/i);
    assert.throws(() => validateOssieDocument({ version: '0.1.1', semantic_model: [{ name: 'empty', datasets: [] }] }), /at least 1 item|datasets/i);
    assert.throws(
        () =>
            validateOssieDocument({
                ...ossieDocument,
                semantic_model: [{ ...ossieDocument.semantic_model[0], datasets: [ossieDocument.semantic_model[0].datasets[0], ossieDocument.semantic_model[0].datasets[0]] }],
            }),
        /duplicate dataset/i,
    );
    assert.throws(
        () =>
            validateOssieDocument({
                ...ossieDocument,
                semantic_model: [
                    { ...ossieDocument.semantic_model[0], relationships: [{ name: 'broken', from: 'orders', to: 'missing', from_columns: ['customer_id'], to_columns: ['id'] }] },
                ],
            }),
        /unknown dataset/i,
    );
    assert.throws(
        () =>
            validateOssieDocument({
                ...ossieDocument,
                semantic_model: [
                    {
                        ...ossieDocument.semantic_model[0],
                        relationships: [{ name: 'broken', from: 'orders', to: 'customers', from_columns: ['customer_id', 'amount'], to_columns: ['id'] }],
                    },
                ],
            }),
        /matching from_columns and to_columns/i,
    );
});

test('knowledge validation rejects unlinked sources, unsafe filters and incomplete relationships', () => {
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
                { definitions: [{ id: 'relationship:x', name: 'X', kind: 'relationship', sourceConnectionId: 'postgres', from: 'orders', to: 'customers' }] },
                sources,
            ),
        /column mappings/i,
    );
});

test('knowledge sources validate supported text formats, size and YAML syntax', () => {
    assert.equal(validateKnowledgeSource('rules.md', '# Revenue').format, 'markdown');
    assert.equal(validateKnowledgeSource('model.yml', serializeOssieDocument(ossieDocument)).format, 'yaml');
    assert.equal(validateKnowledgeSource('notes.txt', 'Fiscal year starts in February.').format, 'text');
    assert.throws(() => validateKnowledgeSource('rules.pdf', 'content'), /only Markdown, YAML, and TXT/i);
    assert.throws(() => validateKnowledgeSource('model.yaml', 'semantic_model: ['), /flow sequence|invalid YAML/i);
    assert.doesNotThrow(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES)));
    assert.throws(() => validateKnowledgeSource('large.md', 'x'.repeat(KNOWLEDGE_SOURCE_MAX_BYTES + 1)), /10 MB/i);
});
