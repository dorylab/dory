import assert from 'node:assert/strict';
import test from 'node:test';

import { RestartInstallCoordinator } from '../../main/updater/restart-install-coordinator.js';

test('keeps restart installation single-flight after before-quit', () => {
    const coordinator = new RestartInstallCoordinator();

    assert.equal(coordinator.tryStart(), true);
    assert.equal(coordinator.handleBeforeQuit(), true);
    assert.equal(coordinator.tryStart(), false);
    assert.equal(coordinator.isInFlight(), true);
});

test('allows retry only after quitAndInstall fails synchronously', () => {
    const coordinator = new RestartInstallCoordinator();

    assert.equal(coordinator.tryStart(), true);
    coordinator.resetAfterFailure();

    assert.equal(coordinator.isInFlight(), false);
    assert.equal(coordinator.tryStart(), true);
});
