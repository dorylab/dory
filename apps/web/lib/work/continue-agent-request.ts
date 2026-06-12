export type ContinueAgentWorkspaceSnapshot = object;

export type ContinueAgentRunRequestInput<TSnapshot extends ContinueAgentWorkspaceSnapshot> = {
    snapshot?: TSnapshot | null;
    focusInvestigationId?: string | null;
    previousAgentStepId?: string | null;
};

export type ContinueAgentRunRequestBody<TSnapshot extends ContinueAgentWorkspaceSnapshot> =
    | {
          workspaceSnapshot: TSnapshot & {
              previousAgentStepId: string | null;
          };
      }
    | {
          focusInvestigationId: string;
      };

export function buildContinueAgentRunRequestBody<TSnapshot extends ContinueAgentWorkspaceSnapshot>(
    input: ContinueAgentRunRequestInput<TSnapshot>,
): ContinueAgentRunRequestBody<TSnapshot> | undefined {
    if (input.snapshot) {
        return {
            workspaceSnapshot: {
                ...input.snapshot,
                previousAgentStepId: input.previousAgentStepId ?? null,
            },
        };
    }

    const focusInvestigationId = input.focusInvestigationId?.trim();
    if (focusInvestigationId) {
        return {
            focusInvestigationId,
        };
    }

    return undefined;
}

export function buildContinueAgentRunFetchInit<TSnapshot extends ContinueAgentWorkspaceSnapshot>(input: ContinueAgentRunRequestInput<TSnapshot>): RequestInit {
    const body = buildContinueAgentRunRequestBody(input);
    return {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    };
}
