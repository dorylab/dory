const TLS_SECRET_KEYS = new Set(['caCertificateContent', 'clientCertificateContent', 'clientPrivateKeyContent', 'clientPrivateKeyPassphrase']);
const IDENTITY_SECRET_KEYS = new Set(['password', 'privateKey', 'privateKeyPassphrase']);

function sanitizeIdentity(identity: unknown) {
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
        return identity;
    }

    const sanitized = { ...(identity as Record<string, unknown>) };
    for (const key of IDENTITY_SECRET_KEYS) {
        delete sanitized[key];
    }
    return sanitized;
}

export function sanitizeConnectionSyncPayload(payload: Record<string, unknown>) {
    const tls = payload.tls;
    const sanitizedPayload = { ...payload };
    delete sanitizedPayload.createLocalDatabase;

    if (Array.isArray(sanitizedPayload.identities)) {
        sanitizedPayload.identities = sanitizedPayload.identities.map(sanitizeIdentity);
    }
    sanitizedPayload.identity = sanitizeIdentity(sanitizedPayload.identity);

    if (tls && typeof tls === 'object' && !Array.isArray(tls)) {
        const sanitizedTls = { ...(tls as Record<string, unknown>) };
        for (const key of TLS_SECRET_KEYS) {
            delete sanitizedTls[key];
        }
        sanitizedPayload.tls = sanitizedTls;
    }

    return sanitizedPayload;
}
