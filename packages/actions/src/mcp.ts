import type { ActionActorType, ActionDefinition } from './types';
import { DEFAULT_ACTION_PROJECTION_BY_ACTOR } from './types';
import type { ActionRegistry } from './registry';

export type McpActionTool = {
    action: ActionDefinition<any, any, any>;
    name: string;
    title: string;
    description: string;
    inputSchema: ActionDefinition<any, any, any>['inputSchema'];
    outputSchema: ActionDefinition<any, any, any>['outputSchema'];
};

export function listMcpActions(registry: ActionRegistry<any>, actorType: ActionActorType = 'mcp'): McpActionTool[] {
    return registry
        .list()
        .filter(action => action.exposure.mcp?.exposed !== false)
        .filter(action => Boolean(action.exposure.mcp))
        .filter(action => action.exposure.actors.includes(actorType))
        .filter(action => action.risk !== 'destructive')
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
