import { createClickhouseConnectionDefaults } from './components/forms/connection/drivers/clickhouse';

export const NEW_CONNECTION_DEFAULT_VALUES = {
    connection: createClickhouseConnectionDefaults(),
    identity: {
        name: 'default user',
        username: '',
        role: '',
        password: '',
        isDefault: true,
    },

    ssh: {
        enabled: false,
        host: '',
        port: 22,
        username: '',
        authMethod: 'password',
    },

    tls: {
        mode: 'disable',
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
    },
};
