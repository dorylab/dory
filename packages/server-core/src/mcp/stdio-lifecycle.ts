import type { Readable } from 'node:stream';

export function waitForInputClose(input: Readable) {
    if (input.destroyed || input.readableEnded) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            input.off('end', onClose);
            input.off('close', onClose);
            input.off('error', onError);
        };
        const onClose = () => {
            cleanup();
            resolve();
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };

        input.once('end', onClose);
        input.once('close', onClose);
        input.once('error', onError);
    });
}
