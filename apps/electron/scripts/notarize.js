import { notarize } from '@electron/notarize';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APPLE_TICKET_WAIT_MS = 15_000;
const APPLE_TICKET_MAX_ATTEMPTS = 8;

dotenvConfig({ path: resolve(__dirname, '../.env.apple') });
console.log('Apple notarization configuration loaded.');

function sleep(ms) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function runStapler(appPath) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn('xcrun', ['stapler', 'staple', '-v', appPath], {
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

async function retryStaple(appPath) {
    for (let attempt = 1; attempt <= APPLE_TICKET_MAX_ATTEMPTS; attempt += 1) {
        try {
            await runStapler(appPath);
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
            await sleep(APPLE_TICKET_WAIT_MS);
        }
    }
}

export default async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }
    if (process.env.SKIP_NOTARIZE === '1') {
        console.log('⏭️ SKIP_NOTARIZE=1, skipping Apple notarization.');
        return;
    }
    console.log('🚀 Start Apple notarization...');
    const appName = context.packager.appInfo.productFilename;
    console.log(`appName: ${appName}`);
    const appPath = `${appOutDir}/${appName}.app`;

    const required = ['APPLE_ID', 'APPLE_ID_PASSWORD', 'APPLE_TEAM_ID'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing Apple notarization env vars: ${missing.join(', ')}`);
    }

    try {
        await notarize({
            appPath,
            appBundleId: 'com.dory.app',
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            tool: 'notarytool',
            teamId: process.env.APPLE_TEAM_ID,
        });
        console.log('✅ Apple notarization + initial stapling succeeded.');
    } catch (error) {
        const message = String(error?.message || error);
        const isStaplePropagationFailure =
            message.includes('Failed to staple your application') || message.includes('Record not found');

        if (isStaplePropagationFailure) {
            console.warn('⚠️ Notarization finished, but Apple ticket was not yet available. Retrying stapling...');
            await retryStaple(appPath);
            return;
        }

        console.error('❌ Apple notarization failed:', error);
        throw error;
    }
};
