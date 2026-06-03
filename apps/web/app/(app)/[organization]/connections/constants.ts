import { createClickhouseConnectionDefaults } from './components/forms/connection/drivers/clickhouse';

export type ConnectionEnvironmentValue = '' | 'dev' | 'staging' | 'prod' | 'personal' | 'shared';
export type ConnectionTagColorValue = '' | 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' | 'gray';

export type ConnectionMetadataOption<TValue extends string> = {
    value: TValue;
    translationKey: string;
};

export type ConnectionTagColorOption = ConnectionMetadataOption<ConnectionTagColorValue> & {
    swatchClassName: string;
    badgeClassName: string;
    selectedClassName: string;
};

export const CONNECTION_ENVIRONMENT_OPTIONS: Array<ConnectionMetadataOption<ConnectionEnvironmentValue>> = [
    { value: '', translationKey: 'ConnectionMetadata.EnvironmentOptions.None' },
    { value: 'dev', translationKey: 'ConnectionMetadata.EnvironmentOptions.Dev' },
    { value: 'staging', translationKey: 'ConnectionMetadata.EnvironmentOptions.Staging' },
    { value: 'prod', translationKey: 'ConnectionMetadata.EnvironmentOptions.Prod' },
    { value: 'personal', translationKey: 'ConnectionMetadata.EnvironmentOptions.Personal' },
    { value: 'shared', translationKey: 'ConnectionMetadata.EnvironmentOptions.Shared' },
];

export const CONNECTION_TAG_COLOR_OPTIONS: ConnectionTagColorOption[] = [
    {
        value: '',
        translationKey: 'ConnectionMetadata.TagColors.None',
        swatchClassName: 'bg-transparent',
        badgeClassName: 'border-border bg-muted text-muted-foreground',
        selectedClassName: 'border-foreground bg-muted text-foreground',
    },
    {
        value: 'red',
        translationKey: 'ConnectionMetadata.TagColors.Red',
        swatchClassName: 'bg-red-500',
        badgeClassName: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
        selectedClassName: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300',
    },
    {
        value: 'orange',
        translationKey: 'ConnectionMetadata.TagColors.Orange',
        swatchClassName: 'bg-orange-500',
        badgeClassName: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
        selectedClassName: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    },
    {
        value: 'amber',
        translationKey: 'ConnectionMetadata.TagColors.Amber',
        swatchClassName: 'bg-amber-500',
        badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        selectedClassName: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    {
        value: 'green',
        translationKey: 'ConnectionMetadata.TagColors.Green',
        swatchClassName: 'bg-emerald-500',
        badgeClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        selectedClassName: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    {
        value: 'blue',
        translationKey: 'ConnectionMetadata.TagColors.Blue',
        swatchClassName: 'bg-blue-500',
        badgeClassName: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
        selectedClassName: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    },
    {
        value: 'purple',
        translationKey: 'ConnectionMetadata.TagColors.Purple',
        swatchClassName: 'bg-purple-500',
        badgeClassName: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
        selectedClassName: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300',
    },
    {
        value: 'gray',
        translationKey: 'ConnectionMetadata.TagColors.Gray',
        swatchClassName: 'bg-muted-foreground',
        badgeClassName: 'border-muted-foreground/30 bg-muted text-muted-foreground',
        selectedClassName: 'border-muted-foreground bg-muted text-foreground',
    },
];

const CONNECTION_ENVIRONMENT_VALUES = new Set(CONNECTION_ENVIRONMENT_OPTIONS.map(option => option.value));
const CONNECTION_TAG_COLOR_VALUES = new Set(CONNECTION_TAG_COLOR_OPTIONS.map(option => option.value));

export function normalizeConnectionEnvironmentValue(value: unknown): ConnectionEnvironmentValue {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toLowerCase();
    return CONNECTION_ENVIRONMENT_VALUES.has(normalized as ConnectionEnvironmentValue) ? (normalized as ConnectionEnvironmentValue) : '';
}

export function normalizeConnectionTagColorValue(value: unknown): ConnectionTagColorValue {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toLowerCase();
    if (normalized.includes(',')) return '';
    return CONNECTION_TAG_COLOR_VALUES.has(normalized as ConnectionTagColorValue) ? (normalized as ConnectionTagColorValue) : '';
}

export function getConnectionEnvironmentOption(value: unknown) {
    const normalized = normalizeConnectionEnvironmentValue(value);
    return normalized ? CONNECTION_ENVIRONMENT_OPTIONS.find(option => option.value === normalized) : null;
}

export function getConnectionTagColorOption(value: unknown) {
    const normalized = normalizeConnectionTagColorValue(value);
    return normalized ? CONNECTION_TAG_COLOR_OPTIONS.find(option => option.value === normalized) : null;
}

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
