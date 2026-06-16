export type WorkAgentProtocolTool =
    | 'work_createInvestigation'
    | 'work_runInvestigationSql'
    | 'work_createInvestigationFinding'
    | 'work_updateInvestigation'
    | 'work_updateConclusion'
    | string;

export type WorkAnalysisAuditStatus = 'draft' | 'reviewed' | 'revised' | 'accepted' | 'rejected';

export type WorkAgentProtocolState = {
    mode: 'full_work' | 'investigation_continue';
    continuationInvestigationId: string | null;
    existingInvestigationIds: string[];
    createdInvestigationIds: string[];
    currentInvestigationId: string | null;
    sqlStarted: boolean;
    pendingFinding: {
        investigationId: string;
        sourceTabId: string | null;
        sourceRunEventId: string | null;
    } | null;
    findingsByInvestigationId: Record<string, number>;
    auditStatusByInvestigationId: Record<string, WorkAnalysisAuditStatus>;
    conclusionUpdated: boolean;
    requireConclusion: boolean;
};

export type WorkAgentProtocolDecision =
    | {
          allowed: true;
      }
    | {
          allowed: false;
          message: string;
      };

export function createWorkAgentProtocolState(options?: {
    mode?: 'full_work' | 'investigation_continue';
    investigationId?: string | null;
    sourceTabId?: string | null;
    hasSnapshotResult?: boolean;
    existingInvestigationIds?: string[];
    existingFindingsByInvestigationId?: Record<string, number>;
    existingAuditStatusByInvestigationId?: Record<string, WorkAnalysisAuditStatus>;
    requireConclusion?: boolean;
}): WorkAgentProtocolState {
    const mode = options?.mode ?? 'full_work';
    const continuationInvestigationId = mode === 'investigation_continue' ? (options?.investigationId ?? null) : null;
    const existingInvestigationIds = mode === 'full_work' ? Array.from(new Set((options?.existingInvestigationIds ?? []).filter(Boolean))) : [];
    const createdInvestigationIds = continuationInvestigationId ? [continuationInvestigationId] : [...existingInvestigationIds];
    return {
        mode,
        continuationInvestigationId,
        existingInvestigationIds,
        createdInvestigationIds,
        currentInvestigationId: continuationInvestigationId ?? existingInvestigationIds[0] ?? null,
        sqlStarted: Boolean(options?.hasSnapshotResult),
        pendingFinding:
            continuationInvestigationId && options?.hasSnapshotResult
                ? {
                      investigationId: continuationInvestigationId,
                      sourceTabId: options.sourceTabId ?? null,
                      sourceRunEventId: null,
                  }
                : null,
        findingsByInvestigationId: continuationInvestigationId
            ? { [continuationInvestigationId]: 0 }
            : Object.fromEntries(existingInvestigationIds.map(id => [id, options?.existingFindingsByInvestigationId?.[id] ?? 0])),
        auditStatusByInvestigationId: continuationInvestigationId
            ? { [continuationInvestigationId]: options?.existingAuditStatusByInvestigationId?.[continuationInvestigationId] ?? 'draft' }
            : Object.fromEntries(existingInvestigationIds.map(id => [id, options?.existingAuditStatusByInvestigationId?.[id] ?? 'draft'])),
        conclusionUpdated: false,
        requireConclusion: options?.requireConclusion ?? true,
    };
}

export function checkWorkAgentProtocol(state: WorkAgentProtocolState, toolName: WorkAgentProtocolTool, input?: unknown): WorkAgentProtocolDecision {
    if (toolName === 'work_createInvestigation') {
        if (state.mode === 'investigation_continue') {
            return {
                allowed: false,
                message: 'Continue the current Analysis instead of creating a new one.',
            };
        }
        if (state.existingInvestigationIds.length > 0) {
            return {
                allowed: false,
                message: 'This Work already has Analyses. Reuse the existing Analysis IDs instead of creating new ones.',
            };
        }
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
        if (state.mode !== 'investigation_continue' && state.existingInvestigationIds.length === 0 && state.createdInvestigationIds.length < 3) {
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
        if (state.mode === 'investigation_continue' && investigationId !== state.continuationInvestigationId) {
            return {
                allowed: false,
                message: 'Run SQL only for the Analysis the human continued from the workspace snapshot.',
            };
        }
        if (!state.createdInvestigationIds.includes(investigationId)) {
            return {
                allowed: false,
                message: 'Run SQL only for an active Analysis in this Work run.',
            };
        }
        if (state.auditStatusByInvestigationId[investigationId] === 'rejected') {
            return {
                allowed: false,
                message: 'Rejected Analyses are excluded from Agent SQL runs.',
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
        if (!state.requireConclusion) {
            return {
                allowed: false,
                message: 'Do not update the Work conclusion for this continuation. The human can update it explicitly.',
            };
        }
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
            state.auditStatusByInvestigationId[id] = extractAuditStatus(output) ?? 'draft';
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

    if (toolName === 'work_updateInvestigation') {
        const investigationId = extractInvestigationId(output);
        const auditStatus = extractAuditStatus(output);
        if (investigationId && auditStatus) {
            state.auditStatusByInvestigationId[investigationId] = auditStatus;
        }
        return;
    }

    if (toolName === 'work_updateConclusion') {
        state.conclusionUpdated = true;
    }
}

export function checkWorkAgentProtocolComplete(state: WorkAgentProtocolState): WorkAgentProtocolDecision {
    const readiness = checkAnalysesReadyToStop(state);
    if (!readiness.allowed) return readiness;
    if (state.requireConclusion && hasIncludedAnalysis(state) && !state.conclusionUpdated) {
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

function checkAnalysesReadyToStop(state: WorkAgentProtocolState): WorkAgentProtocolDecision {
    if (state.mode === 'investigation_continue') {
        const investigationId = state.continuationInvestigationId;
        if (!investigationId) {
            return {
                allowed: false,
                message: 'Choose an Analysis before updating the conclusion.',
            };
        }
        if (state.pendingFinding) {
            return {
                allowed: false,
                message: 'Create a Finding for the current SQL result before updating the conclusion.',
            };
        }
        if ((state.findingsByInvestigationId[investigationId] ?? 0) < 1) {
            return {
                allowed: false,
                message: 'Create at least one Finding for the continued Analysis before updating the conclusion.',
            };
        }
        return { allowed: true };
    }

    if (state.existingInvestigationIds.length === 0 && state.createdInvestigationIds.length < 3) {
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
    const missingFinding = activeInvestigationIds(state).find(id => (state.findingsByInvestigationId[id] ?? 0) < 1);
    if (missingFinding) {
        return {
            allowed: false,
            message: 'Create at least one Finding for every Analysis before updating the conclusion.',
        };
    }
    return { allowed: true };
}

function checkAnalysesReadyForConclusion(state: WorkAgentProtocolState): WorkAgentProtocolDecision {
    const readiness = checkAnalysesReadyToStop(state);
    if (!readiness.allowed) return readiness;

    if (state.mode === 'investigation_continue') {
        const investigationId = state.continuationInvestigationId;
        if (!investigationId || state.auditStatusByInvestigationId[investigationId] === 'rejected') {
            return {
                allowed: false,
                message: 'Include the continued Analysis before updating the conclusion.',
            };
        }
        return { allowed: true };
    }

    if (!hasIncludedAnalysis(state)) {
        return {
            allowed: false,
            message: 'Include at least one Analysis before updating the conclusion.',
        };
    }

    return { allowed: true };
}

function hasIncludedAnalysis(state: WorkAgentProtocolState) {
    return activeInvestigationIds(state).length > 0;
}

function activeInvestigationIds(state: WorkAgentProtocolState) {
    return state.createdInvestigationIds.filter(id => state.auditStatusByInvestigationId[id] !== 'rejected');
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

function extractAuditStatus(input: unknown): WorkAnalysisAuditStatus | null {
    const status = extractString(input, 'auditStatus');
    if (status === 'draft' || status === 'reviewed' || status === 'revised' || status === 'accepted' || status === 'rejected') {
        return status;
    }
    return null;
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
