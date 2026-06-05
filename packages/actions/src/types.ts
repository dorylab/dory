import type { OrganizationPermissionMap, OrganizationPermissionResource } from '@dory/shared/types/organization';
import type { DoryRuntime } from '@dory/shared/runtime';
import type { z } from 'zod';

export type ActionActorType = 'user' | 'agent' | 'mcp' | 'automation';
export type ActionDomain = 'connection' | 'schema' | 'table' | 'query' | 'tab' | 'savedQuery' | 'chart' | 'ai';
export type ActionKind = 'query' | 'command';
export type ActionRisk = 'read' | 'low' | 'write' | 'destructive';
export type ActionId = `${ActionDomain}.${string}`;
export type ActionScope = string;
export type ActionProjection = 'canonical' | 'ui' | 'agent' | 'mcp' | 'automation';
export type ActionEffect = string;
export type ActionDesktopAuthMode = 'local-workspace' | 'cloud-required';

export const DEFAULT_ACTION_PROJECTION_BY_ACTOR: Record<ActionActorType, ActionProjection> = {
    user: 'ui',
    agent: 'agent',
    mcp: 'mcp',
    automation: 'automation',
};

export type ActionActor = {
    type: ActionActorType;
    scopes: ActionScope[];
    id?: string | null;
    name?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type ActionAccess = {
    isMember: boolean;
    role?: string | null;
    permissions: OrganizationPermissionMap;
};

export type ActionPermissionRequirement = {
    resource: OrganizationPermissionResource;
    action: string;
};

export type ActionResourceRef = {
    type: string;
    id?: string | null;
    name?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type ActionPermissionPolicy<TInput = unknown, TServices = unknown> = {
    organization?: ActionPermissionRequirement[];
    scopes?: ActionScope[];
    scopeAliases?: Partial<Record<ActionScope, ActionScope[]>>;
    resource?: (ctx: ActionContext<TServices>, input: TInput) => Promise<void> | void;
    confirmation?: {
        required: boolean;
    };
    destructive?: {
        scope?: ActionScope;
        requireConfirmation?: boolean;
    };
};

export type ActionProjectionDefinition<TCanonicalOutput = unknown, TProjectedOutput = unknown, TServices = unknown> = {
    schema: z.ZodType<TProjectedOutput>;
    project?: (output: TCanonicalOutput, ctx: ActionContext<TServices>) => Promise<TProjectedOutput> | TProjectedOutput;
};

export type ActionProjectionMap<TCanonicalOutput = unknown, TServices = unknown> = Partial<
    Record<ActionProjection, ActionProjectionDefinition<TCanonicalOutput, unknown, TServices>>
>;

export type ActionExposurePolicy<TCanonicalOutput = unknown, TServices = unknown> = {
    actors: ActionActorType[];
    defaultProjection?: Partial<Record<ActionActorType, ActionProjection>>;
    projections?: ActionProjectionMap<TCanonicalOutput, TServices>;
    mcp?: ActionMcpMetadata;
};

export type ActionAuditStatus = 'success' | 'error' | 'denied' | 'invalid' | 'canceled';

export type ActionAuditResource = ActionResourceRef;

export type ActionAuditPolicy<TInput = unknown, TCanonicalOutput = unknown, TServices = unknown> = {
    sourceByActor?: Partial<Record<ActionActorType, string>>;
    resource?: (ctx: ActionContext<TServices>, input: TInput) => Promise<ActionAuditResource | null | undefined> | ActionAuditResource | null | undefined;
    allowInputFields?: string[];
    inputSummary?: (input: TInput, ctx: ActionContext<TServices>) => Promise<Record<string, unknown> | null | undefined> | Record<string, unknown> | null | undefined;
    outputSummary?: (output: TCanonicalOutput, ctx: ActionContext<TServices>) => Promise<Record<string, unknown> | null | undefined> | Record<string, unknown> | null | undefined;
};

export type ActionAuditRecord = {
    actionRunId: string;
    requestId?: string | null;
    actionId: ActionId;
    version: number;
    status: ActionAuditStatus;
    risk: ActionRisk;
    effects?: ActionEffect[];
    organizationId: string;
    userId: string;
    actorType: ActionActorType;
    actorId?: string | null;
    projection: ActionProjection;
    source?: string | null;
    resource?: ActionAuditResource | null;
    inputHash?: string | null;
    redactedInputSummary?: Record<string, unknown> | null;
    redactedOutputSummary?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs: number;
    createdAt: string;
};

export type ActionAuditSink = {
    record: (event: ActionAuditRecord) => Promise<void> | void;
};

export type ActionExecutionMetadata = {
    actionRunId: string;
    requestId?: string | null;
    actionId: ActionId;
    version: number;
    actorType: ActionActorType;
    actorId?: string | null;
    source?: string | null;
    projection: ActionProjection;
    status: ActionAuditStatus;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
};

export type ActionExecutionEnvelope<TOutput = unknown> = {
    data: TOutput;
    execution: ActionExecutionMetadata;
};

export type ActionContext<TServices = unknown> = {
    organizationId: string;
    userId: string;
    actor: ActionActor;
    access: ActionAccess;
    runtime?: DoryRuntime | null;
    locale?: string | null;
    currentConnectionId?: string | null;
    auditSource?: string | null;
    requestId?: string | null;
    actionRunId?: string | null;
    audit?: ActionAuditSink | null;
    services: TServices;
};

export type ActionMcpMetadata = {
    name: string;
    title: string;
    description: string;
    exposed?: boolean;
};

export type ActionDefinition<TInput = unknown, TOutput = unknown, TServices = unknown> = {
    id: ActionId;
    version: 1;
    domain: ActionDomain;
    kind: ActionKind;
    risk: ActionRisk;
    effects?: ActionEffect[];
    inputSchema: z.ZodType<TInput>;
    outputSchema: z.ZodType<TOutput>;
    permission: ActionPermissionPolicy<TInput, TServices>;
    exposure: ActionExposurePolicy<TOutput, TServices>;
    audit: ActionAuditPolicy<TInput, TOutput, TServices>;
    desktopAuth?: ActionDesktopAuthMode;
    handler: (ctx: ActionContext<TServices>, input: TInput) => Promise<TOutput> | TOutput;
};

export type InferActionInput<TAction> = TAction extends ActionDefinition<infer TInput, unknown, unknown> ? TInput : never;
export type InferActionOutput<TAction> = TAction extends ActionDefinition<unknown, infer TOutput, unknown> ? TOutput : never;
