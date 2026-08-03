import { createHmac } from 'node:crypto';

import { getDBService } from '@dory/database';

import { EMBED_DEMO_IP_SESSION_LIMIT } from './config';

function getClientIp(headers: Headers) {
    const raw = headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for') ?? headers.get('x-real-ip');
    return raw?.split(',')[0]?.trim() || 'unknown';
}

function getRateLimitSecret() {
    const configured = process.env.DORY_EMBED_DEMO_RATE_LIMIT_SECRET?.trim();
    if (configured) return configured;
    if (process.env.NODE_ENV === 'production') throw new Error('DORY_EMBED_DEMO_RATE_LIMIT_SECRET is required');
    return 'local-embed-demo-rate-limit-secret';
}

export async function consumeEmbedDemoSession(headers: Headers, now = new Date()) {
    const dayKey = now.toISOString().slice(0, 10);
    const ipHash = createHmac('sha256', getRateLimitSecret())
        .update(`${dayKey}:${getClientIp(headers)}`)
        .digest('hex');
    const db = await getDBService();
    const sessions = await db.embedDemo.consumeSession({ dayKey, ipHash, limit: EMBED_DEMO_IP_SESSION_LIMIT });
    return { allowed: sessions !== null, sessions, limit: EMBED_DEMO_IP_SESSION_LIMIT };
}
