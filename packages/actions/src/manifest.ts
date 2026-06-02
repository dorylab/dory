import type { ActionActorType, ActionDefinition, ActionDomain, ActionEffect, ActionId, ActionKind, ActionProjection, ActionRisk, ActionScope } from './types';
import type { ActionRegistry } from './registry';

export type ActionManifestEntry = {
    id: ActionId;
    version: number;
    domain: ActionDomain;
    kind: ActionKind;
    risk: ActionRisk;
    effects?: ActionEffect[];
    requiresConfirmation: boolean;
    requiredPermissions: Array<{ resource: string; action: string }>;
    requiredScopes: ActionScope[];
    allowedActors: ActionActorType[];
    projections: ActionProjection[];
    mcp?: {
        name: string;
        title: string;
        description: string;
        exposed: boolean;
    };
};

export type ActionManifest = {
    generatedAt: string;
    actions: ActionManifestEntry[];
};

export function actionToManifestEntry(action: ActionDefinition<any, any, any>): ActionManifestEntry {
    return {
        id: action.id,
        version: action.version,
        domain: action.domain,
        kind: action.kind,
        risk: action.risk,
        effects: action.effects,
        requiresConfirmation: action.permission.confirmation?.required ?? (action.risk === 'destructive' && action.permission.destructive?.requireConfirmation !== false),
        requiredPermissions: (action.permission.organization ?? []).map(requirement => ({
            resource: requirement.resource,
            action: requirement.action,
        })),
        requiredScopes: [...(action.permission.scopes ?? [])],
        allowedActors: [...action.exposure.actors],
        projections: Object.keys(action.exposure.projections ?? {}) as ActionProjection[],
        mcp: action.exposure.mcp
            ? {
                  name: action.exposure.mcp.name,
                  title: action.exposure.mcp.title,
                  description: action.exposure.mcp.description,
                  exposed: action.exposure.mcp.exposed !== false,
              }
            : undefined,
    };
}

export function buildActionManifest(registry: ActionRegistry<any>, now: Date = new Date()): ActionManifest {
    return {
        generatedAt: now.toISOString(),
        actions: registry.list().map(actionToManifestEntry),
    };
}
