import assert from 'node:assert/strict';

import { buildResultSetPreview, inferResultSetColumns, resultSetDataAvailability, type ResultSetManifest } from '../../src/index';

const rows = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, name: `row-${index + 1}` }));
const columns = inferResultSetColumns(rows);
const preview = buildResultSetPreview({ columns, rows, maxRows: 2 });

assert.equal(preview.previewRowCount, 2);
assert.equal(preview.truncated, true);
assert.deepEqual(
    columns.map(column => column.name),
    ['id', 'name'],
);

const manifest: ResultSetManifest = {
    format: 'dory.resultset.v1',
    artifactId: 'rs_test',
    organizationId: 'org_test',
    kind: 'sql-result-set',
    status: 'success',
    source: { type: 'query-run' },
    schema: columns,
    rowCount: 5,
    previewRowCount: 2,
    limited: true,
    files: {
        preview: { path: 'preview.json', format: 'json', rowCount: 2 },
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
};

assert.equal(resultSetDataAvailability(manifest), 'preview-only');
