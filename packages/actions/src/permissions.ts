import type { ActionContext, ActionDefinition, ActionPermissionRequirement, ActionScope } from './types';
import { ActionError } from './errors';

const DEFAULT_SCOPE_ALIASES: Partial<Record<ActionScope, ActionScope[]>> = {
    'schema:read': ['connections:read'],
};

export type ActionPermissionEvaluationOptions = {
    confirmationToken?: string | null;
};

function hasPermission(ctx: ActionContext, requirement: ActionPermissionRequirement): boolean {
    const resource = ctx.access.permissions[requirement.resource] as Record<string, boolean> | undefined;
    return Boolean(ctx.access.isMember && resource?.[requirement.action]);
}

export function hasActionScope(scopes: readonly ActionScope[], scope: ActionScope, aliases: Partial<Record<ActionScope, ActionScope[]>> = DEFAULT_SCOPE_ALIASES): boolean {
    if (scopes.includes(scope)) return true;

    for (const alias of aliases[scope] ?? []) {
        if (scopes.includes(alias)) return true;
    }

    return false;
}

function hasScope(ctx: ActionContext, scope: ActionScope, aliases?: Partial<Record<ActionScope, ActionScope[]>>): boolean {
    return hasActionScope(ctx.actor.scopes, scope, {
        ...DEFAULT_SCOPE_ALIASES,
        ...(aliases ?? {}),
    });
}

export async function assertActionAllowed(ctx: ActionContext<any>, action: ActionDefinition<any, any, any>, input: unknown, options: ActionPermissionEvaluationOptions = {}) {
    if (action.exposure.actors.length && !action.exposure.actors.includes(ctx.actor.type)) {
        throw new ActionError('ACTION_ACTOR_NOT_ALLOWED', `Actor type "${ctx.actor.type}" is not allowed to execute action "${action.id}".`, { status: 403 });
    }

    for (const requirement of action.permission.organization ?? []) {
        if (!hasPermission(ctx, requirement)) {
            throw new ActionError('ACTION_FORBIDDEN', `Missing permission ${requirement.resource}:${requirement.action} for action "${action.id}".`, {
                status: 403,
                details: requirement,
            });
        }
    }

    for (const scope of action.permission.scopes ?? []) {
        if (!hasScope(ctx, scope, action.permission.scopeAliases)) {
            throw new ActionError('ACTION_SCOPE_MISSING', `Missing action scope "${scope}" for action "${action.id}".`, { status: 403, details: { scope } });
        }
    }

    if (action.permission.resource) {
        try {
            await action.permission.resource(ctx, input);
        } catch (error) {
            if (error instanceof ActionError) throw error;
            throw new ActionError('ACTION_RESOURCE_FORBIDDEN', error instanceof Error ? error.message : `Resource gate rejected action "${action.id}".`, {
                status: 403,
                cause: error,
            });
        }
    }

    if (action.risk === 'destructive' && !hasScope(ctx, 'action:destructive')) {
        throw new ActionError('ACTION_SCOPE_MISSING', `Destructive action "${action.id}" requires the action:destructive scope.`, {
            status: 403,
            details: { scope: 'action:destructive' },
        });
    }

    if (action.risk === 'write' && action.permission.confirmation?.required === undefined) {
        throw new ActionError('ACTION_CONFIRMATION_POLICY_MISSING', `Write action "${action.id}" must explicitly declare its confirmation policy.`, {
            status: 500,
            details: { actionId: action.id },
        });
    }

    const requiresConfirmation = action.permission.confirmation?.required ?? (action.risk === 'destructive' && action.permission.destructive?.requireConfirmation !== false);
    if (requiresConfirmation && !options.confirmationToken) {
        throw new ActionError('ACTION_CONFIRMATION_REQUIRED', `Action "${action.id}" requires confirmation.`, {
            status: 403,
            details: { actionId: action.id },
        });
    }
}
