export type ActionErrorCode =
    | 'ACTION_NOT_FOUND'
    | 'ACTION_INPUT_INVALID'
    | 'ACTION_OUTPUT_INVALID'
    | 'ACTION_PROJECTION_INVALID'
    | 'ACTION_FORBIDDEN'
    | 'ACTION_SCOPE_MISSING'
    | 'ACTION_ACTOR_NOT_ALLOWED'
    | 'ACTION_RESOURCE_FORBIDDEN'
    | 'ACTION_CONFIRMATION_REQUIRED'
    | 'ACTION_CONFIRMATION_POLICY_MISSING'
    | 'ACTION_EXECUTION_FAILED';

export class ActionError extends Error {
    readonly code: ActionErrorCode;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: ActionErrorCode, message: string, options: { status?: number; details?: unknown; cause?: unknown } = {}) {
        super(message, { cause: options.cause });
        this.name = 'ActionError';
        this.code = code;
        this.status = options.status ?? statusForActionErrorCode(code);
        this.details = options.details;
    }
}

export function statusForActionErrorCode(code: ActionErrorCode): number {
    switch (code) {
        case 'ACTION_NOT_FOUND':
            return 404;
        case 'ACTION_INPUT_INVALID':
        case 'ACTION_OUTPUT_INVALID':
        case 'ACTION_PROJECTION_INVALID':
            return 400;
        case 'ACTION_FORBIDDEN':
        case 'ACTION_SCOPE_MISSING':
        case 'ACTION_ACTOR_NOT_ALLOWED':
        case 'ACTION_RESOURCE_FORBIDDEN':
        case 'ACTION_CONFIRMATION_REQUIRED':
            return 403;
        case 'ACTION_CONFIRMATION_POLICY_MISSING':
        case 'ACTION_EXECUTION_FAILED':
        default:
            return 500;
    }
}

export function toActionError(error: unknown): ActionError {
    if (error instanceof ActionError) return error;
    return new ActionError('ACTION_EXECUTION_FAILED', error instanceof Error ? error.message : String(error ?? 'Action execution failed'), { cause: error });
}
