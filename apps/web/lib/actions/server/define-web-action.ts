import { defineAction } from '@dory/actions';
import type {
    ActionActorType,
    ActionAuditPolicy,
    ActionDefinition,
    ActionDesktopAuthMode,
    ActionExposurePolicy,
    ActionId,
    ActionMcpMetadata,
    ActionPermissionRequirement,
} from '@dory/actions';
import type { z } from 'zod';
import { defaultActionAuditPolicy } from './policies';
import type { WebActionServices } from './types';

export type WebActionRegistration<TInput, TOutput> = Omit<
    ActionDefinition<TInput, TOutput, WebActionServices>,
    'version' | 'outputSchema' | 'permission' | 'exposure' | 'audit'
> & {
    outputSchema: z.ZodType<TOutput>;
    permissions?: ActionPermissionRequirement[];
    scopes?: string[];
    actors: ActionActorType[];
    mcp?: ActionMcpMetadata;
    requiresConfirmation?: boolean;
    defaultProjection?: ActionExposurePolicy<TOutput, WebActionServices>['defaultProjection'];
    projections?: ActionExposurePolicy<TOutput, WebActionServices>['projections'];
    audit?: ActionAuditPolicy<TInput, TOutput, WebActionServices>;
    desktopAuth?: ActionDesktopAuthMode;
};

const LOCAL_WORKSPACE_ACTION_IDS = new Set<ActionId>([
    'chart.buildChartProfile',
    'chart.buildResultContext',
    'query.cancel',
    'query.execute',
    'query.readOnlyExecute',
]);

function getDefaultDesktopAuthMode(action: Pick<ActionDefinition<any, any, WebActionServices>, 'id' | 'domain'>): ActionDesktopAuthMode {
    if (LOCAL_WORKSPACE_ACTION_IDS.has(action.id)) {
        return 'local-workspace';
    }

    if (['connection', 'tab', 'savedQuery', 'schema', 'table', 'work'].includes(action.domain)) {
        return 'local-workspace';
    }

    return 'cloud-required';
}

export function defineWebAction<TInput, TOutput>(action: WebActionRegistration<TInput, TOutput>) {
    const { outputSchema, permissions, scopes, actors, mcp, requiresConfirmation, defaultProjection, projections, audit, desktopAuth, ...definition } = action;
    if (definition.risk === 'write' && typeof requiresConfirmation !== 'boolean') {
        throw new Error(`Write action "${definition.id}" must explicitly declare requiresConfirmation.`);
    }

    return defineAction({
        ...definition,
        version: 1,
        outputSchema,
        permission: {
            organization: permissions ?? [],
            scopes: scopes ?? [],
            confirmation:
                typeof requiresConfirmation === 'boolean'
                    ? {
                          required: requiresConfirmation,
                      }
                    : undefined,
            destructive: definition.risk === 'destructive' ? { requireConfirmation: true } : undefined,
        },
        exposure: {
            actors,
            mcp,
            defaultProjection,
            projections,
        },
        audit: audit ?? defaultActionAuditPolicy(definition.domain),
        desktopAuth: desktopAuth ?? getDefaultDesktopAuthMode(definition),
    });
}
