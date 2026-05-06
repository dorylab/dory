import assert from 'node:assert/strict';
import test from 'node:test';

const cryptoModuleUrl = new URL('../../lib/utils/crypto.ts', import.meta.url).href;

async function roundTripWithSecret(secret: string): Promise<string> {
    const previousSecret = process.env.DS_SECRET_KEY;
    process.env.DS_SECRET_KEY = secret;

    try {
        const { encrypt, decrypt } = await import(`${cryptoModuleUrl}?secret=${encodeURIComponent(secret)}&ts=${Date.now()}`);
        const cipherText = await encrypt('postgres-password');

        assert.notEqual(cipherText, 'postgres-password');

        return await decrypt(cipherText);
    } finally {
        if (typeof previousSecret === 'undefined') {
            delete process.env.DS_SECRET_KEY;
        } else {
            process.env.DS_SECRET_KEY = previousSecret;
        }
    }
}

test('crypto accepts base64 DS_SECRET_KEY values', async () => {
    const plainText = await roundTripWithSecret('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=');
    assert.equal(plainText, 'postgres-password');
});

test('crypto accepts raw DS_SECRET_KEY values used in docker deployments', async () => {
    const plainText = await roundTripWithSecret('test-secret-key-test-secret-key');
    assert.equal(plainText, 'postgres-password');
});

test('crypto accepts hex DS_SECRET_KEY values', async () => {
    const plainText = await roundTripWithSecret('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    assert.equal(plainText, 'postgres-password');
});
