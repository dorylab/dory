const IV_LENGTH = 16; // 128-bit
const TAG_LENGTH = 16; // 128-bit auth tag for AES-GCM

let cachedKeyBytes: Uint8Array | null = null;
let cachedKey: CryptoKey | null = null;
let warnedAboutDerivedSecret = false;

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

function tryBase64ToBytes(b64: string): Uint8Array | null {
    try {
        return base64ToBytes(b64);
    } catch {
        return null;
    }
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error('Hex string length must be even');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
        const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) {
            throw new Error('Hex string contains invalid characters');
        }
        bytes[i] = byte;
    }
    return bytes;
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

async function getSecretKeyBytes(): Promise<Uint8Array> {
    if (cachedKeyBytes) return cachedKeyBytes;
    const envSecret = typeof process !== 'undefined' ? process.env.DS_SECRET_KEY : undefined;
    if (envSecret) {
        const normalizedSecret = envSecret.trim();
        const decoded = tryBase64ToBytes(normalizedSecret);
        if (decoded?.length === 32) {
            cachedKeyBytes = decoded;
            return decoded;
        }

        if (/^[0-9a-f]{64}$/i.test(normalizedSecret)) {
            const hexDecoded = hexToBytes(normalizedSecret);
            cachedKeyBytes = hexDecoded;
            return hexDecoded;
        }

        const rawBytes = new TextEncoder().encode(normalizedSecret);
        if (rawBytes.length === 32) {
            cachedKeyBytes = rawBytes;
            return rawBytes;
        }

        const crypto = getWebCrypto();
        if (!warnedAboutDerivedSecret) {
            warnedAboutDerivedSecret = true;
            console.warn('[crypto] DS_SECRET_KEY is not base64, hex, or 32-byte raw text; deriving a stable key with SHA-256.');
        }
        const digest = await crypto.subtle.digest('SHA-256', rawBytes);
        cachedKeyBytes = new Uint8Array(digest);
        return cachedKeyBytes;
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
    cachedKey = await crypto.subtle.importKey('raw', toArrayBuffer(await getSecretKeyBytes()), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
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
