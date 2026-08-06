import { z } from 'zod';
import { getConnectionDriver } from './components/forms/connection/drivers';
import { isAbsoluteOrHomePath, validateLocalDatabaseFileName, type LocalDatabaseType } from './components/forms/connection/drivers/local-database';

const requiredPort = z.preprocess(
    value => {
        if (value === '' || value === null || typeof value === 'undefined') return undefined;
        if (typeof value === 'string') return Number(value);
        return value;
    },
    z.number().int().min(1, 'Please provide a port number').max(65535, 'Port must be between 1 and 65535'),
);

function isAbsolutePath(value: string) {
    return /^(\/|[a-zA-Z]:[\\/])/.test(value);
}

function getLowerPathExtension(value: string) {
    const match = value.trim().match(/\.([^.\\/]+)$/);
    return match?.[1]?.toLowerCase() ?? '';
}

function hasTrimmedString(value: unknown) {
    return typeof value === 'string' && value.trim() !== '';
}

function validateNewLocalDatabase(value: Record<string, any>, type: LocalDatabaseType, ctx: z.RefinementCtx) {
    const fileName = value.localDatabaseFileName?.trim?.() ?? '';
    const fileNameError = validateLocalDatabaseFileName(type, fileName);
    if (fileNameError) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'localDatabaseFileName'],
            message:
                fileNameError === 'missing'
                    ? 'Please provide a database file name'
                    : fileNameError === 'invalid'
                      ? 'File name must not contain path separators'
                      : type === 'duckdb'
                        ? 'DuckDB file name must use .duckdb or .db'
                        : 'SQLite file name must use .sqlite, .sqlite3, or .db',
        });
    }

    const directory = value.localDatabaseDirectory?.trim?.() ?? '';
    if (!directory) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'localDatabaseDirectory'],
            message: 'Please provide a database location',
        });
    } else if (!isAbsoluteOrHomePath(directory)) {
        ctx.addIssue({
            code: 'custom',
            path: ['connection', 'localDatabaseDirectory'],
            message: 'Database location must be absolute or start with ~/',
        });
    }
}

function hasCertificateValue(tls: Record<string, unknown> | null | undefined, sourceName: string, pathName: string, contentName: string, hasContentName: string) {
    if (!tls) return false;
    if (tls[sourceName] === 'content') {
        return hasTrimmedString(tls[contentName]) || tls[hasContentName] === true;
    }
    return hasTrimmedString(tls[pathName]);
}

export const ConnectionDialogFormSchema = z
    .object({
        connection: z.object({
            type: z.string().min(1, 'Please select a connection type'),
            name: z.string().min(1, 'Please provide a connection name'),
            description: z.string().optional().nullable(),
            host: z.string().optional().nullable(),
            port: requiredPort.optional().nullable(),
            httpPort: requiredPort.optional().nullable(),
            ssl: z.boolean().default(false),
            database: z.string().optional().nullable(),
            connectString: z.string().optional().nullable(),
            path: z.string().optional().nullable(),
            localDatabaseSource: z.enum(['existing', 'new']).optional(),
            localDatabaseFileName: z.string().optional(),
            localDatabaseDirectory: z.string().optional(),
            accountId: z.string().optional().nullable(),
            duckdbMode: z.enum(['local', 'motherduck']).optional(),
            warehouse: z.string().optional().nullable(),
            schema: z.string().optional().nullable(),
            authMethod: z.enum(['password', 'key_pair']).optional(),
            environment: z.string().optional(),
            tags: z.string().optional(),
        }),
        identity: z.object({
            id: z.string().optional().nullable(),
            name: z.string().optional(),
            username: z.string().optional().nullable(),
            role: z.string().optional().nullable(),
            password: z.string().optional().nullable(),
            privateKey: z.string().optional().nullable(),
            privateKeyPassphrase: z.string().optional().nullable(),
            isDefault: z.boolean().optional(),
        }),
        ssh: z.object({
            enabled: z.boolean().optional(),
            host: z.string().optional().nullable(),
            port: z.number().optional().nullable(),
            username: z.string().optional().nullable(),
            authMethod: z.string().optional().nullable(),
            password: z.string().optional().nullable(),
            privateKey: z.string().optional().nullable(),
            passphrase: z.string().optional().nullable(),
        }),
        tls: z
            .object({
                mode: z.enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-identity']).optional(),
                caCertificateSource: z.enum(['path', 'content']).optional(),
                caCertificatePath: z.string().optional().nullable(),
                caCertificateContent: z.string().optional().nullable(),
                hasCaCertificateContent: z.boolean().optional(),
                clientCertificateSource: z.enum(['path', 'content']).optional(),
                clientCertificatePath: z.string().optional().nullable(),
                clientCertificateContent: z.string().optional().nullable(),
                hasClientCertificateContent: z.boolean().optional(),
                clientPrivateKeySource: z.enum(['path', 'content']).optional(),
                clientPrivateKeyPath: z.string().optional().nullable(),
                clientPrivateKeyContent: z.string().optional().nullable(),
                hasClientPrivateKeyContent: z.boolean().optional(),
                clientPrivateKeyPassphrase: z.string().optional().nullable(),
                hasClientPrivateKeyPassphrase: z.boolean().optional(),
                serverName: z.string().optional().nullable(),
                ciphers: z.string().optional().nullable(),
                minVersion: z.string().optional().nullable(),
                maxVersion: z.string().optional().nullable(),
            })
            .optional()
            .nullable(),
    })
    .superRefine((value, ctx) => {
        const driver = getConnectionDriver(value.connection.type);
        driver.validate(value.connection, ctx);

        if (value.connection.type === 'sqlite') {
            if (value.connection.localDatabaseSource === 'new') {
                validateNewLocalDatabase(value.connection, 'sqlite', ctx);
                return;
            }
            const normalizedPath = value.connection.path?.trim() ?? '';
            const extension = getLowerPathExtension(normalizedPath);
            if (!normalizedPath) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['connection', 'path'],
                    message: 'Please provide a SQLite file path',
                });
            } else if (!isAbsolutePath(normalizedPath)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['connection', 'path'],
                    message: 'SQLite path must be absolute',
                });
            } else if (extension === 'duckdb') {
                ctx.addIssue({
                    code: 'custom',
                    path: ['connection', 'path'],
                    message: 'This is a DuckDB file. Change the connection type to DuckDB.',
                });
            }
            return;
        }

        if (value.connection.type === 'duckdb') {
            const mode = value.connection.duckdbMode === 'motherduck' ? 'motherduck' : 'local';
            if (mode === 'local') {
                if (value.connection.localDatabaseSource === 'new') {
                    validateNewLocalDatabase(value.connection, 'duckdb', ctx);
                    return;
                }
                const normalizedPath = value.connection.path?.trim() ?? '';
                const extension = getLowerPathExtension(normalizedPath);
                if (!normalizedPath) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['connection', 'path'],
                        message: 'Please provide a DuckDB file path',
                    });
                } else if (!isAbsolutePath(normalizedPath)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['connection', 'path'],
                        message: 'DuckDB path must be absolute',
                    });
                } else if (extension === 'sqlite' || extension === 'sqlite3') {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['connection', 'path'],
                        message: 'This is a SQLite file. Change the connection type to SQLite.',
                    });
                }
            } else if (!value.identity.id && !value.identity.password?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['identity', 'password'],
                    message: 'Please provide a MotherDuck token',
                });
            }
            return;
        }

        if (value.connection.type === 'neon') {
            if (!value.connection.host?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['connection', 'host'],
                    message: 'Please provide a Neon connection string',
                });
            }
            return;
        }

        if (value.connection.type === 'supabase') {
            if (!value.connection.host?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['connection', 'host'],
                    message: 'Please provide a Supabase connection string',
                });
            }
            return;
        }

        if (value.connection.type === 'cloudflare-d1') {
            if (!value.identity.id && !value.identity.password?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['identity', 'password'],
                    message: 'Please provide a Cloudflare API token',
                });
            }
            return;
        }

        if (value.connection.type === 'snowflake') {
            if (!value.connection.host?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['connection', 'host'],
                    message: 'Please provide a Snowflake account identifier',
                });
            }
            if (!value.identity.username?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['identity', 'username'],
                    message: 'Please provide a username',
                });
            }
            if (value.connection.authMethod === 'key_pair') {
                if (!value.identity.id && !value.identity.privateKey?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['identity', 'privateKey'],
                        message: 'Please provide a private key',
                    });
                }
            } else if (!value.identity.id && !value.identity.password?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['identity', 'password'],
                    message: 'Please provide a password',
                });
            }
            return;
        }

        if (value.connection.type === 'clickhouse') {
            const tlsMode = value.tls?.mode ?? 'disable';
            if (tlsMode === 'verify-ca' || tlsMode === 'verify-identity') {
                if (!hasCertificateValue(value.tls, 'caCertificateSource', 'caCertificatePath', 'caCertificateContent', 'hasCaCertificateContent')) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['tls', value.tls?.caCertificateSource === 'content' ? 'caCertificateContent' : 'caCertificatePath'],
                        message: 'Please provide a CA certificate',
                    });
                }
            }
            if (tlsMode === 'verify-identity') {
                if (!hasCertificateValue(value.tls, 'clientCertificateSource', 'clientCertificatePath', 'clientCertificateContent', 'hasClientCertificateContent')) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['tls', value.tls?.clientCertificateSource === 'content' ? 'clientCertificateContent' : 'clientCertificatePath'],
                        message: 'Please provide a client certificate',
                    });
                }
                if (!hasCertificateValue(value.tls, 'clientPrivateKeySource', 'clientPrivateKeyPath', 'clientPrivateKeyContent', 'hasClientPrivateKeyContent')) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['tls', value.tls?.clientPrivateKeySource === 'content' ? 'clientPrivateKeyContent' : 'clientPrivateKeyPath'],
                        message: 'Please provide a client private key',
                    });
                }
            }
        }

        if (!value.connection.host?.trim()) {
            ctx.addIssue({
                code: 'custom',
                path: ['connection', 'host'],
                message: 'Please provide a host',
            });
        }

        if (typeof value.connection.port !== 'number' || !Number.isFinite(value.connection.port)) {
            ctx.addIssue({
                code: 'custom',
                path: ['connection', 'port'],
                message: 'Please provide a port number',
            });
        }

        if (!value.identity.username?.trim()) {
            ctx.addIssue({
                code: 'custom',
                path: ['identity', 'username'],
                message: 'Please provide a username',
            });
        }
    });
