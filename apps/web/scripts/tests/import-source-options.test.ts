import assert from 'node:assert/strict';
import test from 'node:test';

import { importSourceFormatForFileName, readStoredImportSourceOptions, recoverStoredImportSourceOptions } from '@/lib/client/import-source-options';

test('stored import source options require a valid format discriminator', () => {
    assert.deepEqual(readStoredImportSourceOptions({ format: 'parquet' }), { format: 'parquet' });
    assert.deepEqual(readStoredImportSourceOptions({ format: 'csv', delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' }), {
        format: 'csv',
        delimiter: ',',
        hasHeader: true,
        encoding: 'utf8',
        quoteChar: '"',
    });
    assert.equal(readStoredImportSourceOptions({ delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' }), null);
    assert.equal(readStoredImportSourceOptions({ format: 'csv', delimiter: ',', hasHeader: true, encoding: 'unknown', quoteChar: '"' }), null);
});

test('display recovery derives format without treating legacy options as persisted v2 options', () => {
    const legacyCsv = { delimiter: '\t', hasHeader: false, encoding: 'utf16le', quoteChar: '"' };
    assert.deepEqual(recoverStoredImportSourceOptions(legacyCsv, 'customers.tsv', 'tsv'), { format: 'csv', ...legacyCsv });
    assert.deepEqual(recoverStoredImportSourceOptions({}, 'customers.feather', 'feather'), { format: 'arrow' });
    assert.equal(recoverStoredImportSourceOptions({}, 'customers.csv', 'csv'), null);
});

test('source file extensions map only to supported translation keys', () => {
    assert.equal(importSourceFormatForFileName('data.csv'), 'csv');
    assert.equal(importSourceFormatForFileName('data.jsonl'), 'ndjson');
    assert.equal(importSourceFormatForFileName('data.parquet'), 'parquet');
    assert.equal(importSourceFormatForFileName('data.ipc'), 'arrow');
    assert.equal(importSourceFormatForFileName('data.xlsx'), null);
});
