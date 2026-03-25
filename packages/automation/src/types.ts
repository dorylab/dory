import type { NextRequest, NextResponse } from 'next/server';

export type AutomationErrorCode =
    | 'NOT_SIGNED_IN'
    | 'ORGANIZATION_REQUIRED'
    | 'LOCALHOST_ONLY'
    | 'INVALID_JSON'
    | 'INVALID_INPUT'
    | 'CONNECTION_NOT_FOUND'
    | 'INTERNAL_ERROR';

export type AutomationErrorPayload = {
    code: AutomationErrorCode;
    message: string;
};

export type AutomationErrorResponse = {
    ok: false;
    error: AutomationErrorPayload;
};

export type AutomationSuccessResponse = {
    ok: true;
};

export type AutomationAuthenticatedUser = {
    id: string;
    email?: string;
};

export type AutomationConnectionSummary = {
    id: string;
    name: string;
    type: string;
};

export type AutomationQueryColumn = {
    name: string;
    type: string;
};

export type AutomationQueryResult = {
    columns: AutomationQueryColumn[];
    rows: unknown[][];
    rowCount: number;
    durationMs: number;
};

export type AutomationTableSummary = {
    name: string;
    type: string;
};

export type AutomationTableColumn = {
    name: string;
    type: string;
    nullable: boolean;
};

export type AutomationTableDescription = {
    name: string;
    columns: AutomationTableColumn[];
};

export type AutomationStatusResponse = AutomationSuccessResponse & {
    app: {
        running: true;
    };
    auth: {
        signedIn: true;
        user: AutomationAuthenticatedUser;
    };
};

export type AutomationConnectionsResponse = AutomationSuccessResponse & {
    connections: AutomationConnectionSummary[];
};

export type AutomationQueryRequest = {
    connectionId: string;
    sql: string;
    limit?: number;
};

export type AutomationQueryResponse = AutomationSuccessResponse & {
    result: AutomationQueryResult;
};

export type AutomationTablesResponse = AutomationSuccessResponse & {
    tables: AutomationTableSummary[];
};

export type AutomationDescribeTableResponse = AutomationSuccessResponse & {
    table: AutomationTableDescription;
};

export type ListAutomationConnectionsInput = {
    organizationId: string;
    userId: string;
};

export type RunAutomationQueryInput = {
    organizationId: string;
    userId: string;
    connectionId: string;
    sql: string;
    limit?: number;
};

export type ListAutomationTablesInput = {
    organizationId: string;
    userId: string;
    connectionId: string;
    database: string;
    schema?: string;
};

export type DescribeAutomationTableInput = {
    organizationId: string;
    userId: string;
    connectionId: string;
    table: string;
    database: string;
    schema?: string;
};

export type AutomationResolvedSession = {
    session: unknown;
    user?: AutomationAuthenticatedUser | null;
    organizationId?: string | null;
};

export type AutomationSessionContext = {
    session: unknown;
    user: AutomationAuthenticatedUser;
    organizationId: string;
};

export type AutomationValueResult<T> = { value: T; response?: never } | { value?: never; response: NextResponse<AutomationErrorResponse> };

export type AutomationSessionResolver = (req: NextRequest) => Promise<AutomationResolvedSession | null>;

export type AutomationConnectionRepository = (
    input: ListAutomationConnectionsInput,
) => Promise<AutomationConnectionSummary[]>;

export type AutomationQueryExecutor = (
    input: RunAutomationQueryInput,
) => Promise<AutomationQueryResult>;

export type AutomationListTablesExecutor = (
    input: ListAutomationTablesInput,
) => Promise<AutomationTableSummary[]>;

export type AutomationDescribeTableExecutor = (
    input: DescribeAutomationTableInput,
) => Promise<AutomationTableDescription>;

export type AutomationRuntimeAdapters = {
    resolveSession: AutomationSessionResolver;
    listConnections: AutomationConnectionRepository;
    runQuery: AutomationQueryExecutor;
    listTables: AutomationListTablesExecutor;
    describeTable: AutomationDescribeTableExecutor;
};
