export type WorkAgentProtocolTool = 'work_createInvestigation' | 'work_runInvestigationSql' | 'work_updateInvestigationSummary' | 'work_updateConclusion' | string;

export type WorkAgentProtocolState = {
    currentInvestigationId: string | null;
    pendingSummary: boolean;
    completedSummaries: number;
    conclusionUpdated: boolean;
};

export type WorkAgentProtocolDecision =
    | {
          allowed: true;
      }
    | {
          allowed: false;
          message: string;
      };

export function createWorkAgentProtocolState(): WorkAgentProtocolState {
    return {
        currentInvestigationId: null,
        pendingSummary: false,
        completedSummaries: 0,
        conclusionUpdated: false,
    };
}

export function checkWorkAgentProtocol(state: WorkAgentProtocolState, toolName: WorkAgentProtocolTool, input?: unknown): WorkAgentProtocolDecision {
    if (toolName === 'work_createInvestigation' && state.pendingSummary) {
        return {
            allowed: false,
            message: 'Update the current investigation summary before creating another investigation.',
        };
    }

    if (toolName === 'work_runInvestigationSql') {
        if (!state.currentInvestigationId) {
            return {
                allowed: false,
                message: 'Create an investigation before running SQL.',
            };
        }
        if (state.pendingSummary) {
            return {
                allowed: false,
                message: 'Update the current investigation summary before running another SQL query.',
            };
        }

        const investigationId = extractInvestigationId(input);
        if (investigationId && investigationId !== state.currentInvestigationId) {
            return {
                allowed: false,
                message: 'Run SQL for the current investigation before switching investigations.',
            };
        }
    }

    if (toolName === 'work_updateInvestigationSummary') {
        if (!state.currentInvestigationId) {
            return {
                allowed: false,
                message: 'Create an investigation before updating its summary.',
            };
        }
        if (!state.pendingSummary) {
            return {
                allowed: false,
                message: 'Run SQL before updating the investigation summary.',
            };
        }

        const inputId = extractId(input);
        if (inputId && inputId !== state.currentInvestigationId) {
            return {
                allowed: false,
                message: 'Update the current investigation summary before switching investigations.',
            };
        }
    }

    if (toolName === 'work_updateConclusion') {
        if (state.pendingSummary) {
            return {
                allowed: false,
                message: 'Update the current investigation summary before updating the conclusion.',
            };
        }
        if (state.completedSummaries < 1) {
            return {
                allowed: false,
                message: 'Complete at least one investigation summary before updating the conclusion.',
            };
        }
    }

    return { allowed: true };
}

export function applyWorkAgentProtocolResult(state: WorkAgentProtocolState, toolName: WorkAgentProtocolTool, output: unknown) {
    if (isToolError(output)) return;

    if (toolName === 'work_createInvestigation') {
        const id = extractId(output);
        if (id) {
            state.currentInvestigationId = id;
            state.pendingSummary = false;
        }
        return;
    }

    if (toolName === 'work_runInvestigationSql') {
        state.pendingSummary = true;
        return;
    }

    if (toolName === 'work_updateInvestigationSummary') {
        const id = extractId(output);
        if (id) state.currentInvestigationId = id;
        state.pendingSummary = false;
        state.completedSummaries += 1;
        return;
    }

    if (toolName === 'work_updateConclusion') {
        state.conclusionUpdated = true;
    }
}

export function checkWorkAgentProtocolComplete(state: WorkAgentProtocolState): WorkAgentProtocolDecision {
    if (state.pendingSummary) {
        return {
            allowed: false,
            message: 'Update the current investigation summary before completing the Work run.',
        };
    }
    if (state.completedSummaries < 1) {
        return {
            allowed: false,
            message: 'Complete at least one investigation summary before completing the Work run.',
        };
    }
    if (!state.conclusionUpdated) {
        return {
            allowed: false,
            message: 'Update the Work conclusion before completing the Work run.',
        };
    }
    return { allowed: true };
}

export function workAgentProtocolError(message: string) {
    return {
        ok: false,
        error: {
            code: 'WORK_PROTOCOL_VIOLATION',
            message,
        },
    };
}

function extractId(output: unknown) {
    if (!output || typeof output !== 'object') return null;
    const id = (output as Record<string, unknown>).id;
    return typeof id === 'string' && id ? id : null;
}

function extractInvestigationId(input: unknown) {
    if (!input || typeof input !== 'object') return null;
    const id = (input as Record<string, unknown>).investigationId ?? (input as Record<string, unknown>).id;
    return typeof id === 'string' && id ? id : null;
}

function isToolError(output: unknown) {
    return Boolean(output && typeof output === 'object' && (output as Record<string, unknown>).ok === false);
}
