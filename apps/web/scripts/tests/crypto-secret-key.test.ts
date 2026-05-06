import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const cryptoModuleUrl = new URL('../../lib/utils/crypto.ts', import.meta.url).href;

function roundTripWithSecret(secret: string): string {
    return execFileSync(
        process.execPath,
        [
            '--import',
            'tsx',
            '--input-type=module',
            '-e',
            [
                `process.env.DS_SECRET_KEY = ${JSON.stringify(secret)};`,
                `const { encrypt, decrypt } = await import(${JSON.stringify(cryptoModuleUrl)});`,
                `const cipherText = await encrypt('postgres-password');`,
                `if (cipherText === 'postgres-password') throw new Error('plaintext was not encrypted');`,
                'process.stdout.write(await decrypt(cipherText));',
            ].join(' '),
        ],
        { encoding: 'utf8' },
    );
}

test('crypto accepts base64 DS_SECRET_KEY values', () => {
    const plainText = roundTripWithSecret('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=');
    assert.equal(plainText, 'postgres-password');
});

test('crypto accepts raw DS_SECRET_KEY values used in docker deployments', () => {
    const plainText = roundTripWithSecret('test-secret-key-test-secret-key');
    assert.equal(plainText, 'postgres-password');
});

test('crypto accepts hex DS_SECRET_KEY values', () => {
    const plainText = roundTripWithSecret('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    assert.equal(plainText, 'postgres-password');
});
