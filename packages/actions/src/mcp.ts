import type { ActionAccess, ActionActorType, ActionDefinition, ActionPermissionRequirement, ActionScope } from './types';
import { DEFAULT_ACTION_PROJECTION_BY_ACTOR } from './types';
import type { ActionRegistry } from './registry';
import { hasActionScope } from './permissions';

export type McpActionTool = {
    action: ActionDefinition<any, any, any>;
    name: string;
    title: string;
    description: string;
    inputSchema: ActionDefinition<any, any, any>['inputSchema'];
    outputSchema: ActionDefinition<any, any, any>['outputSchema'];
};

export type ListMcpActionsOptions = {
    scopes?: readonly ActionScope[] | null;
    access?: ActionAccess | null;
};

function hasPermission(access: ActionAccess, requirement: ActionPermissionRequirement): boolean {
    const resource = access.permissions[requirement.resource] as Record<string, boolean> | undefined;
    return Boolean(access.isMember && resource?.[requirement.action]);
}

function isActionVisibleToActor(action: ActionDefinition<any, any, any>, actorType: ActionActorType, options: ListMcpActionsOptions) {
    if (action.exposure.mcp?.exposed === false) return false;
    if (!action.exposure.mcp) return false;
    if (!action.exposure.actors.includes(actorType)) return false;

    if (options.scopes) {
        for (const scope of action.permission.scopes ?? []) {
            if (!hasActionScope(options.scopes, scope, action.permission.scopeAliases)) {
                return false;
            }
        }
    }

    if (options.access) {
        for (const requirement of action.permission.organization ?? []) {
            if (!hasPermission(options.access, requirement)) {
                return false;
            }
        }
    }

    return true;
}

export function listMcpActions(registry: ActionRegistry<any>, actorType: ActionActorType = 'mcp', options: ListMcpActionsOptions = {}): McpActionTool[] {
    return registry
        .list()
        .filter(action => isActionVisibleToActor(action, actorType, options))
        .map(action => ({
            action,
            name: action.exposure.mcp!.name,
            title: action.exposure.mcp!.title,
            description: action.exposure.mcp!.description,
            inputSchema: action.inputSchema,
            outputSchema:
                action.exposure.projections?.[action.exposure.defaultProjection?.[actorType] ?? DEFAULT_ACTION_PROJECTION_BY_ACTOR[actorType]]?.schema ?? action.outputSchema,
        }));
}
