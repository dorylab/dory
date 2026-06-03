import fs from 'fs';
import type { ConnectionOptions, SecureContextOptions } from 'tls';

export type TlsMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-identity';

export type DriverTlsOptions = {
    mode?: string | null;
    caCertificatePath?: string | null;
    clientCertificatePath?: string | null;
    clientPrivateKeyPath?: string | null;
    serverName?: string | null;
    ciphers?: string | null;
    minVersion?: string | null;
    maxVersion?: string | null;
    caCertificateContent?: string | null;
    clientCertificateContent?: string | null;
    clientPrivateKeyContent?: string | null;
    clientPrivateKeyPassphrase?: string | null;
};

export function normalizeTlsMode(value: unknown): TlsMode | undefined {
    if (typeof value !== 'string') return undefined;
    const mode = value.trim().toLowerCase();
    if (mode === 'disable' || mode === 'prefer' || mode === 'require' || mode === 'verify-ca' || mode === 'verify-identity') {
        return mode;
    }
    return undefined;
}

export function getDriverTlsOptions(options: Record<string, unknown> | undefined): DriverTlsOptions | undefined {
    const tlsOptions = options?.tls;
    if (!tlsOptions || typeof tlsOptions !== 'object' || Array.isArray(tlsOptions)) return undefined;
    return tlsOptions as DriverTlsOptions;
}

function readPemContent(content: unknown, pathValue: unknown): string | undefined {
    if (typeof content === 'string' && content.trim()) {
        return content;
    }
    if (typeof pathValue === 'string' && pathValue.trim()) {
        return fs.readFileSync(pathValue.trim(), 'utf8');
    }
    return undefined;
}

export function buildSecureContextOptions(tlsOptions: DriverTlsOptions | undefined): SecureContextOptions {
    const secure: SecureContextOptions = {};
    if (!tlsOptions) return secure;

    const ca = readPemContent(tlsOptions.caCertificateContent, tlsOptions.caCertificatePath);
    const cert = readPemContent(tlsOptions.clientCertificateContent, tlsOptions.clientCertificatePath);
    const key = readPemContent(tlsOptions.clientPrivateKeyContent, tlsOptions.clientPrivateKeyPath);

    if (ca) secure.ca = ca;
    if (cert) secure.cert = cert;
    if (key) secure.key = key;
    if (tlsOptions.clientPrivateKeyPassphrase) secure.passphrase = tlsOptions.clientPrivateKeyPassphrase;
    if (tlsOptions.ciphers) secure.ciphers = tlsOptions.ciphers;
    if (tlsOptions.minVersion) secure.minVersion = tlsOptions.minVersion as SecureContextOptions['minVersion'];
    if (tlsOptions.maxVersion) secure.maxVersion = tlsOptions.maxVersion as SecureContextOptions['maxVersion'];

    return secure;
}

export function buildNodeTlsConnectionOptions(tlsOptions: DriverTlsOptions | undefined, legacy?: ConnectionOptions | boolean): ConnectionOptions | boolean | undefined {
    const mode = normalizeTlsMode(tlsOptions?.mode);
    if (!mode) return legacy;
    if (mode === 'disable') return false;

    const secure = buildSecureContextOptions(tlsOptions);
    const rejectUnauthorized = mode === 'verify-ca' || mode === 'verify-identity';

    return {
        ...secure,
        servername: tlsOptions?.serverName ?? undefined,
        rejectUnauthorized,
        ...(mode === 'verify-ca' ? { checkServerIdentity: () => undefined } : {}),
    };
}

export function buildMysqlTlsOptions(tlsOptions: DriverTlsOptions | undefined, legacy?: Record<string, unknown>): Record<string, unknown> | undefined {
    const mode = normalizeTlsMode(tlsOptions?.mode);
    if (!mode) return legacy;
    if (mode === 'disable') return undefined;

    const secure = buildSecureContextOptions(tlsOptions) as Record<string, unknown>;
    return {
        ...secure,
        rejectUnauthorized: mode === 'verify-ca' || mode === 'verify-identity',
        verifyIdentity: mode === 'verify-identity',
    };
}

export function isTlsPreferMode(options: Record<string, unknown> | undefined): boolean {
    return normalizeTlsMode(getDriverTlsOptions(options)?.mode) === 'prefer';
}

export function withTlsDisabledOptions<T extends { options?: Record<string, any> }>(config: T): T {
    return {
        ...config,
        options: {
            ...(config.options ?? {}),
            tls: {
                ...(getDriverTlsOptions(config.options) ?? {}),
                mode: 'disable',
            },
        },
    };
}

export function isTlsNegotiationError(error: unknown): boolean {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
    return /ssl|tls|certificate|cert|handshake|self.signed|unable to verify|wrong version|unknown ca|does not support ssl/i.test(message);
}
