import type {
    ExplorerBaseParams,
    ExplorerListKind,
    ExplorerObjectKind,
    ExplorerResource,
} from './types';
import { DEFAULT_EXPLORER_CATALOG } from './types';

function e(value: string): string {
    return encodeURIComponent(value);
}

export function buildExplorerBasePath(params: ExplorerBaseParams): string {
    const base = `/${e(params.organization)}/${e(params.connectionId)}/explorer`;

    if (!params.catalog || params.catalog === DEFAULT_EXPLORER_CATALOG) {
        return base;
    }

    return `${base}/catalog/${e(params.catalog)}`;
}

export function buildExplorerPath(params: ExplorerBaseParams, resource?: ExplorerResource): string {
    const base = buildExplorerBasePath(params);

    if (!resource) return base;

    switch (resource.kind) {
        case 'database':
            return `${base}/database/${e(resource.database)}`;
        case 'schema':
            return `${base}/database/${e(resource.database)}/schema/${e(resource.schema)}`;
        case 'list':
            return resource.schema
                ? `${base}/database/${e(resource.database)}/schema/${e(resource.schema)}/${e(resource.listKind)}`
                : `${base}/database/${e(resource.database)}/${e(resource.listKind)}`;
        case 'object':
            return resource.schema
                ? `${base}/database/${e(resource.database)}/schema/${e(resource.schema)}/${e(resource.objectKind)}/${e(resource.name)}`
                : `${base}/database/${e(resource.database)}/${e(resource.objectKind)}/${e(resource.name)}`;
    }
}

export function buildExplorerDatabasePath(params: ExplorerBaseParams, database: string): string {
    return buildExplorerPath(params, { kind: 'database', database });
}

export function buildExplorerSchemaPath(params: ExplorerBaseParams, database: string, schema: string): string {
    return buildExplorerPath(params, { kind: 'schema', database, schema });
}

export function buildExplorerListPath(
    params: ExplorerBaseParams,
    options: {
        database: string;
        schema?: string;
        listKind: ExplorerListKind;
    },
): string {
    return buildExplorerPath(params, {
        kind: 'list',
        database: options.database,
        schema: options.schema,
        listKind: options.listKind,
    });
}

export function buildExplorerObjectPath(
    params: ExplorerBaseParams,
    options: {
        database: string;
        schema?: string;
        objectKind: Exclude<ExplorerObjectKind, 'database' | 'schema'>;
        name: string;
    },
): string {
    return buildExplorerPath(params, {
        kind: 'object',
        database: options.database,
        schema: options.schema,
        objectKind: options.objectKind,
        name: options.name,
    });
}
