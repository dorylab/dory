import { createHmac, timingSafeEqual } from 'crypto';

const STATE_VERSION = 'v1';
const DEFAULT_STATE_TTL_MS = 24 * 60 * 60 * 1000;

type ElectronEmailVerificationStatePayload = {
    userId: string;
    email: string;
    expiresAt: number;
};

function getStateSecret(): string | null {
    return process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

function signStatePayload(secret: string, encodedPayload: string): string {
    return createHmac('sha256', secret).update(`${STATE_VERSION}.${encodedPayload}`).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createElectronEmailVerificationState(input: { userId: string; email: string; now?: number; ttlMs?: number }): string | null {
    const secret = getStateSecret();
    if (!secret) return null;

    const now = input.now ?? Date.now();
    const payload: ElectronEmailVerificationStatePayload = {
        userId: input.userId,
        email: input.email.toLowerCase(),
        expiresAt: now + (input.ttlMs ?? DEFAULT_STATE_TTL_MS),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = signStatePayload(secret, encodedPayload);

    return `${STATE_VERSION}.${encodedPayload}.${signature}`;
}

export function verifyElectronEmailVerificationState(state: string | null | undefined, now = Date.now()): ElectronEmailVerificationStatePayload | null {
    const secret = getStateSecret();
    if (!secret || !state) return null;

    const [version, encodedPayload, signature] = state.split('.');
    if (version !== STATE_VERSION || !encodedPayload || !signature) return null;

    const expectedSignature = signStatePayload(secret, encodedPayload);
    if (!safeEqual(signature, expectedSignature)) return null;

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<ElectronEmailVerificationStatePayload>;
        if (typeof payload.userId !== 'string' || !payload.userId) return null;
        if (typeof payload.email !== 'string' || !payload.email) return null;
        if (typeof payload.expiresAt !== 'number' || payload.expiresAt < now) return null;

        return {
            userId: payload.userId,
            email: payload.email.toLowerCase(),
            expiresAt: payload.expiresAt,
        };
    } catch {
        return null;
    }
}
