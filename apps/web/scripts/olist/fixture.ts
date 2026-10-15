import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function fileHash(file: string) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

export async function verifyOlistFixture(directory: string) {
    const data = JSON.parse(await readFile(path.join(directory, 'data-manifest.json'), 'utf8')) as {
        benchmarkEligible: boolean;
        datasetVersionNumber: number;
        asOf: string;
        sqlitePath: string;
        expectedSha256: string;
        sqliteSha256: string;
    };
    assert.equal(data.benchmarkEligible, true, 'Prepare did not produce a trustworthy fixture');
    assert.equal(data.datasetVersionNumber, 2, 'Unexpected Olist version');
    const [expectedSha256, sqliteSha256] = await Promise.all([fileHash(path.join(directory, 'expected.json')), fileHash(data.sqlitePath)]);
    assert.equal(expectedSha256, data.expectedSha256, 'CSV oracle changed; rerun prepare');
    assert.equal(sqliteSha256, data.sqliteSha256, 'SQLite fixture changed; rerun prepare');
    return { asOf: data.asOf, expectedSha256, sqliteSha256 };
}
