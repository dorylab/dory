export class RestartInstallCoordinator {
    private inFlight = false;

    isInFlight() {
        return this.inFlight;
    }

    tryStart() {
        if (this.inFlight) {
            return false;
        }

        this.inFlight = true;
        return true;
    }

    handleBeforeQuit() {
        // Squirrel can still be preparing and moving its staged bundle after Electron emits
        // before-quit. Keep the lock for the rest of this process so a second request cannot
        // register another native update-downloaded listener or replace the staging state.
        return this.inFlight;
    }

    resetAfterFailure() {
        this.inFlight = false;
    }
}
