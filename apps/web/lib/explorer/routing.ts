import { getDriverCapabilities, isSupportedListKind, isSupportedObjectKind, resolveExplorerDriver } from './capabilities';
import { buildExplorerBasePath, buildExplorerDatabasePath, buildExplorerListPath, buildExplorerObjectPath, buildExplorerSchemaPath } from './build-path';
import { parseExplorerSlug } from './parse-slug';
import { resolveClickhouseExplorerResource } from './resolvers/clickhouse';
import { resolveDorisExplorerResource } from './resolvers/doris';
import { resolveMysqlExplorerResource } from './resolvers/mysql';
import { resolvePostgresExplorerResource } from './resolvers/postgres';
import { resolveTrinoExplorerResource } from './resolvers/trino';
import type { BreadcrumbItem, ExplorerBaseParams, ExplorerDriver, ExplorerListKind, ExplorerObjectKind, ExplorerResolvedRoute, ExplorerResource } from './types';

function normalizeExplorerResourceForDriver(driver: ExplorerDriver, resource?: ExplorerResource): ExplorerResource | undefined {
    switch (driver) {
        case 'postgres':
        case 'oracle':
        case 'sqlserver':
            return resolvePostgresExplorerResource(resource);
        case 'duckdb':
        case 'mysql':
        case 'mariadb':
            return resolveMysqlExplorerResource(resource);
        case 'clickhouse':
            return resolveClickhouseExplorerResource(resource);
        case 'doris':
            return resolveDorisExplorerResource(resource);
        case 'trino':
            return resolveTrinoExplorerResource(resource);
        default:
            return resolveMysqlExplorerResource(resource);
    }
}

export function objectKindToListKind(kind: Exclude<ExplorerObjectKind, 'database' | 'schema'>): ExplorerListKind | undefined {
    switch (kind) {
        case 'table':
            return 'tables';
        case 'view':
            return 'views';
        case 'materializedView':
            return 'materializedViews';
        case 'function':
            return 'functions';
        case 'sequence':
            return 'sequences';
        case 'dictionary':
            return 'dictionaries';
        case 'procedure':
            return 'procedures';
        default:
            return undefined;
    }
}

export function isValidExplorerResourceForDriver(driver: string | undefined | null, resource?: ExplorerResource): boolean {
    if (!resource) return true;

    const capabilities = getDriverCapabilities(driver);

    switch (resource.kind) {
        case 'database':
            return capabilities.supportsDatabase;
        case 'schema':
            return capabilities.supportsSchema;
        case 'list':
            if (resource.schema && !capabilities.supportsSchema) return false;
            return isSupportedListKind(driver, resource.listKind);
        case 'object':
            if (resource.schema && !capabilities.supportsSchema) return false;
            return isSupportedObjectKind(driver, resource.objectKind);
    }
}

function getPageType(resource?: ExplorerResource): ExplorerResolvedRoute['pageType'] {
    if (!resource) {
        return 'root';
    }

    if (resource.kind === 'object') {
        return 'object';
    }

    if (resource.kind === 'schema' || (resource.kind === 'list' && resource.schema)) {
        return 'schemaSummary';
    }

    return 'namespace';
}

export function resolveExplorerRoute(params: { driver?: string | null; slug?: string[] }): ExplorerResolvedRoute {
    const parsed = parseExplorerSlug(params.slug);
    const driver = resolveExplorerDriver(params.driver);
    const resource = normalizeExplorerResourceForDriver(driver, parsed.resource);
    const isValid = parsed.recognized && isValidExplorerResourceForDriver(driver, resource);

    return {
        catalog: parsed.catalog,
        slug: parsed.segments,
        normalizedSlug: resource ? buildExplorerResourceSegments(resource) : [],
        driver,
        resource,
        pageType: isValid ? getPageType(resource) : 'notFound',
        recognized: parsed.recognized,
        isValid,
    };
}

function buildExplorerResourceSegments(resource: ExplorerResource): string[] {
    switch (resource.kind) {
        case 'database':
            return ['database', resource.database];
        case 'schema':
            return ['database', resource.database, 'schema', resource.schema];
        case 'list':
            return resource.schema ? ['database', resource.database, 'schema', resource.schema, resource.listKind] : ['database', resource.database, resource.listKind];
        case 'object':
            return resource.schema
                ? ['database', resource.database, 'schema', resource.schema, resource.objectKind, resource.name]
                : ['database', resource.database, resource.objectKind, resource.name];
    }
}

export function buildExplorerBreadcrumbs(params: ExplorerBaseParams, resource?: ExplorerResource): BreadcrumbItem[] {
    const items: BreadcrumbItem[] = [
        {
            label: 'Explorer',
            href: buildExplorerBasePath(params),
        },
    ];

    if (!resource) return items;

    items.push({
        label: resource.database,
        href: buildExplorerDatabasePath(params, resource.database),
    });

    if (resource.kind === 'database') {
        return items;
    }

    if ('schema' in resource && resource.schema) {
        items.push({
            label: resource.schema,
            href: buildExplorerSchemaPath(params, resource.database, resource.schema),
        });
    }

    if (resource.kind === 'schema') {
        return items;
    }

    if (resource.kind === 'list') {
        return items;
    }

    items.push({
        label: resource.name,
        href: buildExplorerObjectPath(params, {
            database: resource.database,
            schema: resource.schema,
            objectKind: resource.objectKind,
            name: resource.name,
        }),
    });

    return items;
}

export function getExplorerHeaderBadgeLabel(resource?: ExplorerResource): string | undefined {
    if (!resource) {
        return undefined;
    }

    if (resource.kind === 'database') {
        return 'Database';
    }

    if (resource.kind === 'schema') {
        return 'Schema';
    }

    if (resource.kind === 'list') {
        return formatListKindLabel(resource.listKind);
    }

    return formatObjectKindLabel(resource.objectKind);
}

export function formatListKindLabel(kind: ExplorerListKind): string {
    switch (kind) {
        case 'tables':
            return 'Tables';
        case 'views':
            return 'Views';
        case 'materializedViews':
            return 'Materialized Views';
        case 'functions':
            return 'Functions';
        case 'sequences':
            return 'Sequences';
        case 'dictionaries':
            return 'Dictionaries';
        case 'procedures':
            return 'Procedures';
        case 'schemas':
            return 'Schemas';
        default:
            return kind;
    }
}

export function formatObjectKindLabel(kind: Exclude<ExplorerObjectKind, 'database' | 'schema'>): string {
    switch (kind) {
        case 'table':
            return 'Table';
        case 'view':
            return 'View';
        case 'materializedView':
            return 'Materialized View';
        case 'function':
            return 'Function';
        case 'sequence':
            return 'Sequence';
        case 'dictionary':
            return 'Dictionary';
        case 'procedure':
            return 'Procedure';
        default:
            return kind;
    }
}
