import { notarize } from '@electron/notarize';
import { config as dotenvConfig } from 'dotenv';
import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APPLE_TICKET_WAIT_MS = 15_000;
const APPLE_TICKET_MAX_ATTEMPTS = 8;

dotenvConfig({ path: resolve(__dirname, '../.env.apple'), quiet: true });

export function shouldSkipNotarize() {
    return process.env.SKIP_NOTARIZE === '1';
}

function getNotarizeCredentials() {
    if (process.env.APPLE_KEYCHAIN_PROFILE) {
        return {
            keychainProfile: process.env.APPLE_KEYCHAIN_PROFILE,
            ...(process.env.APPLE_KEYCHAIN ? { keychain: process.env.APPLE_KEYCHAIN } : {}),
        };
    }

    const appleIdPassword = process.env.APPLE_ID_PASSWORD ?? process.env.APPLE_APP_SPECIFIC_PASSWORD;
    const required = [
        ['APPLE_ID', process.env.APPLE_ID],
        ['APPLE_ID_PASSWORD or APPLE_APP_SPECIFIC_PASSWORD', appleIdPassword],
        ['APPLE_TEAM_ID', process.env.APPLE_TEAM_ID],
    ];
    const missing = required.filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`Missing Apple notarization env vars: ${missing.join(', ')}`);
    }

    return {
        appleId: process.env.APPLE_ID,
        appleIdPassword,
        teamId: process.env.APPLE_TEAM_ID,
    };
}

function runStapler(targetPath) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn('xcrun', ['stapler', 'staple', '-v', targetPath], {
            stdio: 'pipe',
        });

        let output = '';
        child.stdout.on('data', (chunk) => {
            output += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            output += String(chunk);
        });

        child.on('error', (error) => rejectPromise(error));
        child.on('close', (code) => {
            if (code === 0) {
                resolvePromise(output);
                return;
            }
            rejectPromise(new Error(`stapler exited with code ${code}\n${output}`));
        });
    });
}

async function retryStaple(targetPath) {
    for (let attempt = 1; attempt <= APPLE_TICKET_MAX_ATTEMPTS; attempt += 1) {
        try {
            await runStapler(targetPath);
            console.log(`✅ Stapling succeeded on retry attempt ${attempt}.`);
            return;
        } catch (error) {
            const isLastAttempt = attempt === APPLE_TICKET_MAX_ATTEMPTS;
            if (isLastAttempt) {
                throw error;
            }
            console.warn(
                `⌛ Stapling attempt ${attempt}/${APPLE_TICKET_MAX_ATTEMPTS} failed, waiting ${APPLE_TICKET_WAIT_MS / 1000}s for Apple ticket propagation...`,
            );
            await new Promise((resolvePromise) => setTimeout(resolvePromise, APPLE_TICKET_WAIT_MS));
        }
    }
}

export async function notarizeTarget(targetPath) {
    try {
        await notarize({
            appPath: targetPath,
            ...getNotarizeCredentials(),
        });
        console.log(`✅ Apple notarization + initial stapling succeeded for ${targetPath}.`);
    } catch (error) {
        const message = String(error?.message || error);
        const isStaplePropagationFailure =
            message.includes('Failed to staple your application') || message.includes('Record not found');

        if (isStaplePropagationFailure) {
            console.warn('⚠️ Notarization finished, but Apple ticket was not yet available. Retrying stapling...');
            await retryStaple(targetPath);
            return;
        }

        console.error(`❌ Apple notarization failed for ${targetPath}:`, error);
        throw error;
    }
}
