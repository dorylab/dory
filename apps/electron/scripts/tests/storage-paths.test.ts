import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resolveDesktopDataPaths } from '../../main/storage-paths.js';

test('keeps all persistent desktop data below the user data directory', () => {
    const userDataPath = path.join('/Users', 'test', 'Library', 'Application Support', 'com.dory.app.beta');
    const dataRoot = path.join(userDataPath, 'data');

    assert.deepEqual(resolveDesktopDataPaths(userDataPath), {
        root: dataRoot,
        database: path.join(dataRoot, 'database'),
        artifacts: path.join(dataRoot, 'artifacts'),
        demoResources: path.join(dataRoot, 'demo-resources'),
        localFiles: path.join(dataRoot, 'local-files'),
    });
});
