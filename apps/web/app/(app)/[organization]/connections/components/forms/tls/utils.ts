export const TLS_SUPPORTED_CONNECTION_TYPES = new Set(['postgres', 'mysql', 'mariadb', 'sqlserver', 'clickhouse']);

export function createTlsDefaultsForConnectionType(connectionType?: string) {
    return {
        mode: connectionType === 'sqlserver' ? 'require' : 'disable',
        caCertificateSource: 'path',
        caCertificatePath: '',
        caCertificateContent: '',
        hasCaCertificateContent: false,
        clientCertificateSource: 'path',
        clientCertificatePath: '',
        clientCertificateContent: '',
        hasClientCertificateContent: false,
        clientPrivateKeySource: 'path',
        clientPrivateKeyPath: '',
        clientPrivateKeyContent: '',
        hasClientPrivateKeyContent: false,
        clientPrivateKeyPassphrase: '',
        hasClientPrivateKeyPassphrase: false,
        serverName: '',
        ciphers: '',
        minVersion: '',
        maxVersion: '',
    };
}

function parseOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

function legacyModeForConnection(connection: any): string {
    const type = connection?.type ?? connection?.engine;
    const options = parseOptions(connection?.options);
    const tls = options.tls && typeof options.tls === 'object' && !Array.isArray(options.tls) ? (options.tls as Record<string, unknown>) : null;
    if (typeof tls?.mode === 'string') {
        return type === 'clickhouse' && tls.mode === 'prefer' ? 'require' : tls.mode;
    }

    if (type === 'postgres') {
        if (typeof options.sslmode === 'string') {
            const mode = options.sslmode.toLowerCase();
            if (mode === 'disable') return 'disable';
            if (mode === 'verify-ca' || mode === 'verify-full') return mode === 'verify-full' ? 'verify-identity' : 'verify-ca';
            return 'require';
        }
        return options.ssl ? 'require' : 'disable';
    }

    if (type === 'mysql' || type === 'mariadb') {
        return options.ssl ? 'require' : 'disable';
    }

    if (type === 'sqlserver') {
        if (options.encrypt === false) return 'disable';
        return options.trustServerCertificate === false ? 'verify-identity' : 'require';
    }

    if (type === 'clickhouse') {
        const protocol = typeof options.protocol === 'string' ? options.protocol.toLowerCase() : '';
        const hasCustomCa = Boolean(tls?.caCertificatePath);
        const hasClientCertificate = Boolean(tls?.clientCertificatePath);
        const hasClientPrivateKey = Boolean(tls?.clientPrivateKeyPath);

        if (hasClientCertificate && hasClientPrivateKey) return 'verify-identity';
        if (hasCustomCa) return 'verify-ca';
        if (options.ssl === true || options.useSSL === true || protocol.startsWith('https')) return 'require';
        if (typeof connection?.host === 'string') {
            try {
                return new URL(connection.host).protocol === 'https:' ? 'require' : 'disable';
            } catch {
                return 'disable';
            }
        }
    }

    return 'disable';
}

export function normalizeTlsForForm(connection: any, tls: any) {
    const type = connection?.type ?? connection?.engine;
    const defaults = createTlsDefaultsForConnectionType(type);
    if (!TLS_SUPPORTED_CONNECTION_TYPES.has(type)) return defaults;

    if (!tls) {
        return {
            ...defaults,
            mode: legacyModeForConnection(connection),
        };
    }

    return {
        ...defaults,
        mode: tls.mode ?? legacyModeForConnection(connection),
        caCertificateSource: tls.hasCaCertificateContent ? 'content' : 'path',
        caCertificatePath: tls.caCertificatePath ?? '',
        hasCaCertificateContent: Boolean(tls.hasCaCertificateContent),
        clientCertificateSource: tls.hasClientCertificateContent ? 'content' : 'path',
        clientCertificatePath: tls.clientCertificatePath ?? '',
        hasClientCertificateContent: Boolean(tls.hasClientCertificateContent),
        clientPrivateKeySource: tls.hasClientPrivateKeyContent ? 'content' : 'path',
        clientPrivateKeyPath: tls.clientPrivateKeyPath ?? '',
        hasClientPrivateKeyContent: Boolean(tls.hasClientPrivateKeyContent),
        hasClientPrivateKeyPassphrase: Boolean(tls.hasClientPrivateKeyPassphrase),
        serverName: tls.serverName ?? '',
        ciphers: tls.ciphers ?? '',
        minVersion: tls.minVersion ?? '',
        maxVersion: tls.maxVersion ?? '',
    };
}

function textOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function contentValue(values: any, contentName: string, hasName: string) {
    const content = textOrNull(values?.[contentName]);
    if (content) return content;
    return values?.[hasName] ? undefined : null;
}

function normalizeClickhouseTlsForSubmit(mode: string, values: any) {
    const clickhouseMode = mode === 'prefer' ? 'require' : mode;
    const useCaContent = values?.caCertificateSource === 'content';
    const useClientCertContent = values?.clientCertificateSource === 'content';
    const useClientKeyContent = values?.clientPrivateKeySource === 'content';

    const disabled = {
        caCertificatePath: null,
        caCertificateContent: null,
        clientCertificatePath: null,
        clientCertificateContent: null,
        clientPrivateKeyPath: null,
        clientPrivateKeyContent: null,
        clientPrivateKeyPassphrase: null,
        serverName: null,
        ciphers: null,
        minVersion: null,
        maxVersion: null,
    };

    if (clickhouseMode === 'disable' || clickhouseMode === 'require') {
        return {
            mode: clickhouseMode,
            ...disabled,
        };
    }

    const caFields = {
        caCertificatePath: useCaContent ? null : textOrNull(values?.caCertificatePath),
        caCertificateContent: useCaContent ? contentValue(values, 'caCertificateContent', 'hasCaCertificateContent') : null,
    };

    if (clickhouseMode === 'verify-identity') {
        return {
            mode: clickhouseMode,
            ...caFields,
            clientCertificatePath: useClientCertContent ? null : textOrNull(values?.clientCertificatePath),
            clientCertificateContent: useClientCertContent ? contentValue(values, 'clientCertificateContent', 'hasClientCertificateContent') : null,
            clientPrivateKeyPath: useClientKeyContent ? null : textOrNull(values?.clientPrivateKeyPath),
            clientPrivateKeyContent: useClientKeyContent ? contentValue(values, 'clientPrivateKeyContent', 'hasClientPrivateKeyContent') : null,
            clientPrivateKeyPassphrase: null,
            serverName: null,
            ciphers: null,
            minVersion: null,
            maxVersion: null,
        };
    }

    return {
        mode: 'verify-ca',
        ...caFields,
        clientCertificatePath: null,
        clientCertificateContent: null,
        clientPrivateKeyPath: null,
        clientPrivateKeyContent: null,
        clientPrivateKeyPassphrase: null,
        serverName: null,
        ciphers: null,
        minVersion: null,
        maxVersion: null,
    };
}

export function normalizeTlsForSubmit(connectionType: string | undefined, values: any) {
    if (!connectionType || !TLS_SUPPORTED_CONNECTION_TYPES.has(connectionType)) return null;

    const mode = typeof values?.mode === 'string' ? values.mode : connectionType === 'sqlserver' ? 'require' : 'disable';
    if (connectionType === 'clickhouse') return normalizeClickhouseTlsForSubmit(mode, values);

    if (mode === 'disable') {
        return {
            mode: 'disable',
            caCertificatePath: null,
            clientCertificatePath: null,
            clientPrivateKeyPath: null,
            caCertificateContent: null,
            clientCertificateContent: null,
            clientPrivateKeyContent: null,
            clientPrivateKeyPassphrase: null,
        };
    }

    const useCaContent = values?.caCertificateSource === 'content';
    const useClientCertContent = values?.clientCertificateSource === 'content';
    const useClientKeyContent = values?.clientPrivateKeySource === 'content';
    const passphrase = textOrNull(values?.clientPrivateKeyPassphrase);

    return {
        mode,
        caCertificatePath: useCaContent ? null : textOrNull(values?.caCertificatePath),
        caCertificateContent: useCaContent ? contentValue(values, 'caCertificateContent', 'hasCaCertificateContent') : null,
        clientCertificatePath: useClientCertContent ? null : textOrNull(values?.clientCertificatePath),
        clientCertificateContent: useClientCertContent ? contentValue(values, 'clientCertificateContent', 'hasClientCertificateContent') : null,
        clientPrivateKeyPath: useClientKeyContent ? null : textOrNull(values?.clientPrivateKeyPath),
        clientPrivateKeyContent: useClientKeyContent ? contentValue(values, 'clientPrivateKeyContent', 'hasClientPrivateKeyContent') : null,
        clientPrivateKeyPassphrase: passphrase ?? (values?.hasClientPrivateKeyPassphrase ? undefined : null),
        serverName: textOrNull(values?.serverName),
        ciphers: textOrNull(values?.ciphers),
        minVersion: textOrNull(values?.minVersion),
        maxVersion: textOrNull(values?.maxVersion),
    };
}
