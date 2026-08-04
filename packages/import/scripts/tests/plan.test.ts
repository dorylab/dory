import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createDefaultMappings,
    hashImportPlan,
    importPlanV1Schema,
    parseDatasetProfile,
    parseImportPlan,
    validateTargetCoverage,
    type DatasetProfileColumnV2,
    type DatasetProfileV2,
    type ImportPlanV1,
    type TargetSchema,
} from '../../src';

const profile: DatasetProfileV2 = {
    version: 'dory.dataset-profile.v2',
    rows: 1,
    sampleRows: 1,
    columns: [profileColumn('id', 'int64', 0, ['1']), profileColumn('Email', 'string', 0, ['a@example.com']), profileColumn('unused', 'string', 1, [])],
    preview: [{ id: '1', Email: 'a@example.com', unused: null }],
    quality: { totalIssues: 0, warningCount: 0, infoCount: 0, columnsWithIssues: 0 },
};

const target: TargetSchema = {
    exists: true,
    columns: [
        { name: 'id', databaseType: 'bigint', importType: 'int64', nullable: false, hasDefault: false },
        { name: 'email', databaseType: 'text', importType: 'string', nullable: false, hasDefault: false },
        { name: 'created_at', databaseType: 'timestamp', importType: 'datetime', nullable: false, hasDefault: true },
    ],
};

test('default mapping uses exact then unambiguous case-insensitive matches', () => {
    assert.deepEqual(createDefaultMappings(profile, target), [
        { source: 'id', target: 'id', targetType: 'int64', ignored: false, order: 0 },
        { source: 'Email', target: 'email', targetType: 'string', ignored: false, order: 1 },
        { source: 'unused', target: 'unused', targetType: 'string', ignored: true, order: 2 },
    ]);
});

test('required target coverage allows nullable and defaulted columns only', () => {
    const mappings = createDefaultMappings(profile, target);
    assert.deepEqual(validateTargetCoverage(target, mappings), []);
    assert.deepEqual(
        validateTargetCoverage(
            target,
            mappings.map(mapping => (mapping.target === 'email' ? { ...mapping, ignored: true } : mapping)),
        ),
        ['email'],
    );
});

test('plan validation rejects replace-on-create and duplicate target names', () => {
    const plan = buildPlan();
    assert.equal(importPlanV1Schema.safeParse(plan).success, true);
    assert.equal(importPlanV1Schema.safeParse({ ...plan, mode: 'replace' }).success, false);
    assert.equal(
        importPlanV1Schema.safeParse({
            ...plan,
            columns: [...plan.columns, { ...plan.columns[0], source: 'Email', target: 'id', order: 1 }],
        }).success,
        false,
    );
});

test('plan hash is stable for equivalent objects and changes with mapping order', () => {
    const plan = buildPlan();
    assert.equal(hashImportPlan(plan), hashImportPlan(structuredClone(plan)));
    assert.notEqual(hashImportPlan(plan), hashImportPlan({ ...plan, columns: plan.columns.map(column => ({ ...column, order: column.order + 1 })) }));
});

test('plan normalization keeps value operations ordered before drop and mapping operations', () => {
    const plan = buildPlan();
    plan.transform.operations = [
        { kind: 'dropInvalid', column: 'id', targetType: 'int64', dropNulls: false },
        { kind: 'trim', column: 'id' },
        { kind: 'replace', column: 'id', find: ',', replacement: '' },
    ];
    assert.deepEqual(
        parseImportPlan(plan).transform.operations.map(operation => operation.kind),
        ['trim', 'replace', 'dropInvalid', 'cast'],
    );
});

test('Profile v1 is rejected instead of being adapted', () => {
    assert.throws(() => parseDatasetProfile({ ...profile, version: 'dory.dataset-profile.v1' }));
    assert.equal(parseDatasetProfile(profile).version, 'dory.dataset-profile.v2');
});

function buildPlan(): ImportPlanV1 {
    return {
        version: 'dory.import-plan.v1',
        parsing: { delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
        target: { mode: 'create', schema: 'public', table: 'customers' },
        columns: [{ source: 'id', target: 'id', targetType: 'int64', ignored: false, order: 0 }],
        mode: 'append',
        batchSize: 1000,
        transform: { version: 'dory.transform.v1', operations: [] },
        sourceSchemaHash: 'a'.repeat(64),
    };
}

function profileColumn(name: string, detectedType: DatasetProfileColumnV2['detectedType'], nullCount: number, sampleValues: string[]): DatasetProfileColumnV2 {
    return {
        name,
        detectedType,
        nullCount,
        nullRate: nullCount,
        nonNullCount: 1 - nullCount,
        emptyCount: 0,
        emptyRate: 0,
        whitespaceCount: 0,
        whitespaceRate: 0,
        leadingZeroCount: 0,
        minLength: null,
        maxLength: null,
        averageLength: null,
        min: null,
        max: null,
        mean: null,
        candidates: [],
        sampleValues,
        sample: { basis: 'sample', rows: 1, distinctCount: sampleValues.length, distinctRate: sampleValues.length, topValues: [], quantiles: null },
        issues: [],
    };
}
