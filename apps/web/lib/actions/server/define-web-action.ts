import { defineAction } from '@dory/actions';
import type { ActionActorType, ActionAuditPolicy, ActionDefinition, ActionExposurePolicy, ActionMcpMetadata, ActionPermissionRequirement } from '@dory/actions';
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
    defaultProjection?: ActionExposurePolicy<TOutput, WebActionServices>['defaultProjection'];
    projections?: ActionExposurePolicy<TOutput, WebActionServices>['projections'];
    audit?: ActionAuditPolicy<TInput, TOutput, WebActionServices>;
};

export function defineWebAction<TInput, TOutput>(action: WebActionRegistration<TInput, TOutput>) {
    const { outputSchema, permissions, scopes, actors, mcp, defaultProjection, projections, audit, ...definition } = action;
    return defineAction({
        ...definition,
        version: 1,
        outputSchema,
        permission: {
            organization: permissions ?? [],
            scopes: scopes ?? [],
            destructive: definition.risk === 'destructive' ? { requireConfirmation: true } : undefined,
        },
        exposure: {
            actors,
            mcp,
            defaultProjection,
            projections,
        },
        audit: audit ?? defaultActionAuditPolicy(definition.domain),
    });
}
