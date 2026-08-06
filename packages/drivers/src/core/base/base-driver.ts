import type { SchemaSnapshot, SchemaSnapshotInput } from '@dory/schema-compare';

import { NotInitializedError, UnsupportedDriverCapabilityError } from './errors';
import { createDriverDataReader } from '../data-reader';
import type { DataOpenOptions, DataStream } from '@dory/data-plane';
import type { ConnectionParameterDialect } from '../registry/types';
import type {
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseExtensionMeta,
    DatabaseFunctionDetail,
    DatabaseFunctionMeta,
    DatabaseMeta,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryOptions,
    DriverCapabilities,
    DriverConfig,
    DriverHealthInfo,
    DriverMonitoringSummary,
    DriverMonitoringSummaryOptions,
    DriverRowCursor,
    DriverQueryContext,
    DriverQueryResult,
    DriverDataReader,
    DriverQueryDataRequest,
    SchemaGraphOptions,
    SchemaGraphResult,
    DriverTableProfile,
    DriverTableDataRequest,
    TableColumnInfo,
    TableMeta,
    TableUpdateBatch,
    TableUpdateResult,
} from '../../types';
import type { DriverQueryParams } from './params/types';
import { SshTunnel, createSshTunnel, type SshOptions } from '../ssh/ssh-tunnel';
import { collectGenericSchemaSnapshot } from '../schema-snapshot';

export abstract class BaseDriver {
    protected _initialized = false;
    abstract readonly dialect: ConnectionParameterDialect;
    readonly capabilities: DriverCapabilities = {};
    private readonly _dataReader: DriverDataReader;

    constructor(public readonly config: DriverConfig) {
        this._dataReader = createDriverDataReader(this);
        this.capabilities.dataReader = this._dataReader;
    }

    private sshTunnel: SshTunnel | null = null;
    protected sshLocalEndpoint: { host: string; port: number } | null = null;

    /** Connection/pool initialization (idempotent) */
    async init(): Promise<void> {
        if (this._initialized) return;
        await this._init();
        this._initialized = true;
    }
    protected abstract _init(): Promise<void>;

    /** Close connection/pool */
    abstract close(): Promise<void>;

    /** Health check */
    abstract ping(): Promise<DriverHealthInfo>;

    /** Execute query (query/DDL/transaction behavior depends on driver) */
    abstract query<Row = any>(sql: string, params?: DriverQueryParams, context?: DriverQueryContext): Promise<DriverQueryResult<Row>>;

    /**
     * Query with context; defaults to plain query.
     * Subclasses can override to support database/schema selection.
     */
    async queryWithContext<Row = any>(sql: string, context?: DriverQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryResult<Row>> {
        return this.query<Row>(sql, context?.params, context);
    }

    async openRowCursorWithContext<Row = any>(_sql: string, _context?: DriverQueryContext & { params?: DriverQueryParams }): Promise<DriverRowCursor<Row>> {
        throw new UnsupportedDriverCapabilityError('openRowCursorWithContext', this.config.type);
    }

    getDataReader(): DriverDataReader {
        return this._dataReader;
    }

    readQuery(request: DriverQueryDataRequest, options?: DataOpenOptions): Promise<DataStream> {
        return this.getDataReader().readQuery(request, options);
    }

    readTable(request: DriverTableDataRequest, options?: DataOpenOptions) {
        return this.getDataReader().readTable(request, options);
    }

    async command(sql: string, params?: DriverQueryParams, context?: DriverQueryContext): Promise<void> {
        await this.query(sql, params, context);
    }

    async cancelQuery(_queryId: string, _context?: DriverQueryContext): Promise<void> {
        throw new Error('DRIVER_CANCEL_UNSUPPORTED');
    }

    async listDatabases(): Promise<DatabaseMeta[]> {
        return this.requireMetadataCapability('getDatabases')();
    }

    async listSchemas(database: string): Promise<DatabaseMeta[]> {
        return this.requireMetadataCapability('getSchemas')(database);
    }

    async getSchema(database?: string): Promise<ConnectionSchemaMap> {
        return this.requireMetadataCapability('getSchema')(database);
    }

    async listTables(database?: string): Promise<TableMeta[]> {
        return this.requireMetadataCapability('getTables')(database);
    }

    async listTablesOnly(database: string): Promise<DatabaseObjectRow[]> {
        return this.requireMetadataCapability('getTablesOnly')(database);
    }

    async listViews(database: string): Promise<DatabaseObjectRow[]> {
        return this.requireMetadataCapability('getViews')(database);
    }

    async listMaterializedViews(database: string): Promise<DatabaseObjectRow[]> {
        return this.requireMetadataCapability('getMaterializedViews')(database);
    }

    async describeTable(database: string, table: string): Promise<TableColumnInfo[]> {
        return this.requireMetadataCapability('getTableColumns')(database, table);
    }

    async listFunctions(database?: string): Promise<DatabaseFunctionMeta[]> {
        return this.requireMetadataCapability('getFunctions')(database);
    }

    async getFunctionDetail(database: string, functionName: string, schema?: string | null): Promise<DatabaseFunctionDetail | null> {
        return this.requireMetadataCapability('getFunctionDetail')(database, functionName, schema);
    }

    async listSequences(database?: string): Promise<DatabaseObjectRow[]> {
        return this.requireMetadataCapability('getSequences')(database);
    }

    async listExtensions(database?: string): Promise<DatabaseExtensionMeta[]> {
        return this.requireMetadataCapability('getExtensions')(database);
    }

    async getDatabaseSummary(options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
        return this.requireMetadataCapability('getDatabaseSummary')(options);
    }

    async getDatabaseTablesDetail(database: string): Promise<DatabaseObjectRow[]> {
        return this.requireMetadataCapability('getDatabaseTablesDetail')(database);
    }

    async getSchemaGraph(options: SchemaGraphOptions): Promise<SchemaGraphResult> {
        return this.requireMetadataCapability('getSchemaGraph')(options);
    }

    async getSchemaSnapshot(input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
        const metadata = this.capabilities.metadata;
        if (!metadata) {
            throw new UnsupportedDriverCapabilityError('getSchemaSnapshot', this.config.type);
        }
        if (metadata.getSchemaSnapshot) {
            return metadata.getSchemaSnapshot(input);
        }
        return collectGenericSchemaSnapshot(this.config, metadata, input);
    }

    async getTableProfile(database: string, table: string): Promise<DriverTableProfile> {
        const metadata = this.capabilities.metadata;
        const tableInfo = this.capabilities.tableInfo;
        const hasColumns = typeof metadata?.getTableColumns === 'function';
        const hasProperties = typeof tableInfo?.properties === 'function';
        const hasStats = typeof tableInfo?.stats === 'function';
        const hasIndexes = typeof tableInfo?.indexes === 'function';
        const hasDdl = typeof tableInfo?.ddl === 'function';

        if (!hasColumns && !hasProperties && !hasStats && !hasIndexes && !hasDdl) {
            throw new UnsupportedDriverCapabilityError('getTableProfile', this.config.type);
        }

        const [columns, properties, stats, indexes, ddl] = await Promise.all([
            hasColumns ? metadata.getTableColumns!(database, table) : Promise.resolve([]),
            hasProperties ? tableInfo.properties(database, table) : Promise.resolve(null),
            hasStats ? tableInfo.stats(database, table) : Promise.resolve(null),
            hasIndexes ? tableInfo.indexes!(database, table) : Promise.resolve([]),
            hasDdl ? tableInfo.ddl(database, table) : Promise.resolve(null),
        ]);

        return {
            capabilities: {
                columns: hasColumns,
                properties: hasProperties,
                stats: hasStats,
                indexes: hasIndexes,
                ddl: hasDdl,
            },
            columns,
            properties,
            stats,
            indexes,
            ddl,
        };
    }

    async commitTableUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        const mutations = this.capabilities.tableMutations;
        if (!mutations) {
            throw new UnsupportedDriverCapabilityError('commitTableUpdates', this.config.type);
        }
        return mutations.commitUpdates(input);
    }

    getDataWriter() {
        const writer = this.capabilities.dataWriter;
        if (!writer) {
            throw new UnsupportedDriverCapabilityError('dataWriter', this.config.type);
        }
        return writer;
    }

    async renameTable(database: string, table: string, nextName: string): Promise<void> {
        const rename = this.capabilities.tableInfo?.rename;
        if (!rename) {
            throw new UnsupportedDriverCapabilityError('renameTable', this.config.type);
        }
        await rename(database, table, nextName);
    }

    async getMonitoringSummary(options: DriverMonitoringSummaryOptions): Promise<DriverMonitoringSummary> {
        const insights = this.capabilities.queryInsights;
        if (!insights) {
            throw new UnsupportedDriverCapabilityError('getMonitoringSummary', this.config.type);
        }

        const [summary, timeline, slowQueries, errorQueries] = await Promise.all([
            insights.summary(options.filters),
            options.includeTimeline === true ? insights.timeline(options.filters) : Promise.resolve(null),
            options.includeSlowQueries === true ? insights.slowQueries(options.filters, options.pagination) : Promise.resolve(null),
            options.includeErrorQueries === true ? insights.errorQueries(options.filters, options.pagination) : Promise.resolve(null),
        ]);

        return {
            filters: options.filters,
            summary,
            timeline,
            slowQueries,
            errorQueries,
        };
    }

    protected assertReady() {
        if (!this._initialized) throw new NotInitializedError();
    }

    private requireMetadataCapability<K extends keyof ConnectionMetadataAPI>(capability: K): NonNullable<ConnectionMetadataAPI[K]> {
        const fn = this.capabilities.metadata?.[capability];
        if (typeof fn !== 'function') {
            throw new UnsupportedDriverCapabilityError(String(capability), this.config.type);
        }
        return fn as NonNullable<ConnectionMetadataAPI[K]>;
    }

    protected async setupSshIfNeeded(targetPort: number) {
        const ssh = this.getSshOptions();
        if (!ssh?.enabled) return;
        const targetHost = ssh.targetHostOverride ?? this.resolveTunnelTargetHost(this.config.host);
        this.sshTunnel = await createSshTunnel(targetHost, targetPort, ssh);
        this.sshLocalEndpoint = {
            host: this.sshTunnel.localHost,
            port: this.sshTunnel.localPort,
        };
    }

    protected async teardownSsh(): Promise<void> {
        if (this.sshTunnel) {
            await this.sshTunnel.close();
            this.sshTunnel = null;
        }
        this.sshLocalEndpoint = null;
    }

    protected getSshEndpoint(): { host: string; port: number } | null {
        return this.sshLocalEndpoint;
    }

    private getSshOptions(): SshOptions | null {
        const options = this.config.options as Record<string, unknown> | undefined;
        if (!options || typeof options !== 'object') return null;
        const ssh = (options as any).ssh as SshOptions | undefined;
        if (!ssh || !ssh.enabled) return null;
        return ssh;
    }

    private resolveTunnelTargetHost(host: string): string {
        const trimmed = host.trim();

        try {
            return new URL(trimmed).hostname;
        } catch {
            try {
                return new URL(`tcp://${trimmed}`).hostname;
            } catch {
                return trimmed;
            }
        }
    }
}

export { BaseDriver as BaseConnection };
