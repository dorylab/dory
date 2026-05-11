const IV_LENGTH = 16; // 128-bit
const TAG_LENGTH = 16; // 128-bit auth tag for AES-GCM

let cachedKeyBytes: Uint8Array | null = null;
let cachedKey: CryptoKey | null = null;

function getWebCrypto(): Crypto {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Web Crypto API is not available in this runtime');
    }
    return globalThis.crypto;
}

function base64ToBytes(b64: string): Uint8Array {
    if (typeof atob === 'function') {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(b64, 'base64'));
    }
    throw new Error('Base64 decoding is not supported in this runtime');
}

function bytesToBase64(bytes: Uint8Array): string {
    if (typeof btoa === 'function') {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    throw new Error('Base64 encoding is not supported in this runtime');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getSecretKeyBytes(): Uint8Array {
    if (cachedKeyBytes) return cachedKeyBytes;
    const envSecret = typeof process !== 'undefined' ? process.env.DS_SECRET_KEY : undefined;
    if (envSecret) {
        const decoded = base64ToBytes(envSecret);
        if (decoded.length !== 32) {
            throw new Error('DS_SECRET_KEY must be 32 bytes (base64 encoded)');
        }
        cachedKeyBytes = decoded;
        return decoded;
    }

    const crypto = getWebCrypto();
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    cachedKeyBytes = random;
    return random;
}

async function getCryptoKey(): Promise<CryptoKey> {
    if (cachedKey) return cachedKey;
    const crypto = getWebCrypto();
    cachedKey = await crypto.subtle.importKey('raw', toArrayBuffer(getSecretKeyBytes()), { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
    ]);
    return cachedKey;
}

export async function encrypt(plainText: string): Promise<string> {
    const crypto = getWebCrypto();
    const iv = new Uint8Array(IV_LENGTH);
    crypto.getRandomValues(iv);

    const key = await getCryptoKey();
    const encoded = new TextEncoder().encode(plainText);
    const ivBuffer = toArrayBuffer(iv);
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuffer }, key, encoded);
    const cipherBytes = new Uint8Array(cipherBuffer);

    const tag = cipherBytes.slice(cipherBytes.length - TAG_LENGTH);
    const ciphertext = cipherBytes.slice(0, cipherBytes.length - TAG_LENGTH);

    // Join as iv:ciphertext:tag, all base64
    return [bytesToBase64(iv), bytesToBase64(ciphertext), bytesToBase64(tag)].join(':');
}

export async function decrypt(cipherText: string): Promise<string> {
    const [ivB64, contentB64, tagB64] = cipherText.split(':');
    if (!ivB64 || !contentB64 || !tagB64) {
        throw new Error('Invalid encrypted string format');
    }

    const iv = base64ToBytes(ivB64);
    const content = base64ToBytes(contentB64);
    const tag = base64ToBytes(tagB64);

    const combined = new Uint8Array(content.length + tag.length);
    combined.set(content, 0);
    combined.set(tag, content.length);

    const crypto = getWebCrypto();
    const key = await getCryptoKey();
    const ivBuffer = toArrayBuffer(iv);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, key, toArrayBuffer(combined));
    return new TextDecoder().decode(plainBuffer);
}
