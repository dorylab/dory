import type { ActionDefinition, ActionId } from './types';

export class ActionRegistry<TServices = unknown> {
    private readonly actions = new Map<ActionId, ActionDefinition<any, any, TServices>>();

    register<TInput, TOutput>(action: ActionDefinition<TInput, TOutput, TServices>): ActionDefinition<TInput, TOutput, TServices> {
        if (this.actions.has(action.id)) {
            throw new Error(`Duplicate action id: ${action.id}`);
        }
        if (!action.outputSchema) {
            throw new Error(`Action "${action.id}" must define an output schema.`);
        }
        if (!action.exposure?.actors?.length) {
            throw new Error(`Action "${action.id}" must define actor exposure.`);
        }
        this.actions.set(action.id, action as ActionDefinition<any, any, TServices>);
        return action;
    }

    registerMany(actions: Array<ActionDefinition<any, any, TServices>>) {
        for (const action of actions) {
            this.register(action);
        }
    }

    get(id: ActionId): ActionDefinition<any, any, TServices> | null {
        return this.actions.get(id) ?? null;
    }

    list(): Array<ActionDefinition<any, any, TServices>> {
        return [...this.actions.values()];
    }

    ids(): ActionId[] {
        return [...this.actions.keys()];
    }
}

export function defineAction<TInput, TOutput, TServices = unknown>(action: ActionDefinition<TInput, TOutput, TServices>): ActionDefinition<TInput, TOutput, TServices> {
    return action;
}
