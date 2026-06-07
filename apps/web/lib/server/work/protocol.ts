export type WorkAgentProtocolTool =
    | 'work_createInvestigation'
    | 'work_runInvestigationSql'
    | 'work_createInvestigationFinding'
    | 'work_updateConclusion'
    | string;

export type WorkAgentProtocolState = {
    createdInvestigationIds: string[];
    currentInvestigationId: string | null;
    sqlStarted: boolean;
    pendingFinding: {
        investigationId: string;
        sourceTabId: string | null;
        sourceRunEventId: string | null;
    } | null;
    findingsByInvestigationId: Record<string, number>;
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
        createdInvestigationIds: [],
        currentInvestigationId: null,
        sqlStarted: false,
        pendingFinding: null,
        findingsByInvestigationId: {},
        conclusionUpdated: false,
    };
}

export function checkWorkAgentProtocol(state: WorkAgentProtocolState, toolName: WorkAgentProtocolTool, input?: unknown): WorkAgentProtocolDecision {
    if (toolName === 'work_createInvestigation') {
        if (state.sqlStarted) {
            return {
                allowed: false,
                message: 'Create all 3-5 analyses before running SQL.',
            };
        }
        if (state.createdInvestigationIds.length >= 5) {
            return {
                allowed: false,
                message: 'Create no more than five analyses for one Work run.',
            };
        }
    }

    if (toolName === 'work_runInvestigationSql') {
        if (state.createdInvestigationIds.length < 3) {
            return {
                allowed: false,
                message: 'Create at least three analyses before running SQL.',
            };
        }
        if (state.pendingFinding) {
            return {
                allowed: false,
                message: 'Create a Finding for the current SQL result before running another SQL query or switching analysis.',
            };
        }

        const investigationId = extractInvestigationId(input);
        if (!investigationId) {
            return {
                allowed: false,
                message: 'Choose an Analysis before running SQL.',
            };
        }
        if (!state.createdInvestigationIds.includes(investigationId)) {
            return {
                allowed: false,
                message: 'Run SQL only for an Analysis created in this Work run.',
            };
        }
    }

    if (toolName === 'work_createInvestigationFinding') {
        if (!state.pendingFinding) {
            return {
                allowed: false,
                message: 'Run SQL before creating a Finding.',
            };
        }

        const investigationId = extractInvestigationId(input);
        if (investigationId && investigationId !== state.pendingFinding.investigationId) {
            return {
                allowed: false,
                message: 'Create the Finding on the Analysis that produced the current SQL result.',
            };
        }
    }

    if (toolName === 'work_updateConclusion') {
        const readiness = checkAnalysesReadyForConclusion(state);
        if (!readiness.allowed) return readiness;
    }

    return { allowed: true };
}

export function applyWorkAgentProtocolResult(state: WorkAgentProtocolState, toolName: WorkAgentProtocolTool, output: unknown) {
    if (isToolError(output)) return;

    if (toolName === 'work_createInvestigation') {
        const id = extractId(output);
        if (id && !state.createdInvestigationIds.includes(id)) {
            state.createdInvestigationIds.push(id);
            state.findingsByInvestigationId[id] = state.findingsByInvestigationId[id] ?? 0;
            state.currentInvestigationId = id;
        }
        return;
    }

    if (toolName === 'work_runInvestigationSql') {
        const investigationId = extractInvestigationId(output) ?? state.currentInvestigationId;
        if (investigationId) {
            state.currentInvestigationId = investigationId;
            state.sqlStarted = true;
            state.pendingFinding = {
                investigationId,
                sourceTabId: extractString(output, 'tabId'),
                sourceRunEventId: extractWorkRunEventId(output),
            };
        }
        return;
    }

    if (toolName === 'work_createInvestigationFinding') {
        const investigationId = extractInvestigationId(output) ?? state.pendingFinding?.investigationId ?? null;
        if (investigationId) {
            state.currentInvestigationId = investigationId;
            state.findingsByInvestigationId[investigationId] = (state.findingsByInvestigationId[investigationId] ?? 0) + 1;
        }
        state.pendingFinding = null;
        return;
    }

    if (toolName === 'work_updateConclusion') {
        state.conclusionUpdated = true;
    }
}

export function checkWorkAgentProtocolComplete(state: WorkAgentProtocolState): WorkAgentProtocolDecision {
    const readiness = checkAnalysesReadyForConclusion(state);
    if (!readiness.allowed) return readiness;
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

function checkAnalysesReadyForConclusion(state: WorkAgentProtocolState): WorkAgentProtocolDecision {
    if (state.createdInvestigationIds.length < 3) {
        return {
            allowed: false,
            message: 'Create at least three analyses before updating the conclusion.',
        };
    }
    if (state.pendingFinding) {
        return {
            allowed: false,
            message: 'Create a Finding for the current SQL result before updating the conclusion.',
        };
    }
    const missingFinding = state.createdInvestigationIds.find(id => (state.findingsByInvestigationId[id] ?? 0) < 1);
    if (missingFinding) {
        return {
            allowed: false,
            message: 'Create at least one Finding for every Analysis before updating the conclusion.',
        };
    }
    return { allowed: true };
}

function extractId(output: unknown) {
    if (!output || typeof output !== 'object') return null;
    const id = (output as Record<string, unknown>).id;
    return typeof id === 'string' && id ? id : null;
}

function extractInvestigationId(input: unknown) {
    if (!input || typeof input !== 'object') return null;
    const record = input as Record<string, unknown>;
    const id = record.investigationId ?? record.id;
    return typeof id === 'string' && id ? id : null;
}

function extractString(input: unknown, key: string) {
    if (!input || typeof input !== 'object') return null;
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' && value ? value : null;
}

function extractWorkRunEventId(output: unknown) {
    if (!output || typeof output !== 'object') return null;
    const resultMeta = (output as Record<string, unknown>).resultMeta;
    if (!resultMeta || typeof resultMeta !== 'object') return null;
    const eventId = (resultMeta as Record<string, unknown>).workRunEventId;
    return typeof eventId === 'string' && eventId ? eventId : null;
}

function isToolError(output: unknown) {
    return Boolean(output && typeof output === 'object' && (output as Record<string, unknown>).ok === false);
}
