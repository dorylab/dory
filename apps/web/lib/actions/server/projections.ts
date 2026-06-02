export function projectConnectionListForTools(output: { connections?: any[] }) {
    return {
        connections: (output.connections ?? []).map(item => ({
            id: item.connection?.id,
            name: item.connection?.name ?? null,
            type: item.connection?.type ?? null,
            engine: item.connection?.engine ?? null,
            database: item.connection?.database ?? null,
            status: item.connection?.status ?? null,
            environment: item.connection?.environment ?? null,
            lastCheckStatus: item.connection?.lastCheckStatus ?? null,
            identities: Array.isArray(item.identities)
                ? item.identities.map((identity: any) => ({
                      id: identity.id,
                      name: identity.name ?? null,
                      username: identity.username ?? null,
                      isDefault: Boolean(identity.isDefault),
                      database: identity.database ?? null,
                  }))
                : [],
        })),
    };
}
