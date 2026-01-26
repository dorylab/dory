

export const NEW_CONNECTION_DEFAULT_VALUES = {
    connection: {
        type: 'clickhouse',
        name: '',
        description: '',
        host: '',
        port: 9000,
        httpPort: 8123,
        database: '',
        environment: '',
        tags: '',
    },
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
    }
};
