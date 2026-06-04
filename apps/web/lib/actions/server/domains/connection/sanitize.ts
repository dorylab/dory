const TLS_SECRET_KEYS = new Set(['caCertificateContent', 'clientCertificateContent', 'clientPrivateKeyContent', 'clientPrivateKeyPassphrase']);

export function sanitizeConnectionSyncPayload(payload: Record<string, unknown>) {
    const tls = payload.tls;
    if (!tls || typeof tls !== 'object' || Array.isArray(tls)) {
        return payload;
    }

    const sanitizedTls = { ...(tls as Record<string, unknown>) };
    for (const key of TLS_SECRET_KEYS) {
        delete sanitizedTls[key];
    }

    return {
        ...payload,
        tls: sanitizedTls,
    };
}
