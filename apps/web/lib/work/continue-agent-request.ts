export type ContinueAgentWorkspaceSnapshot = object;

export type ContinueAgentRunRequestInput<TSnapshot extends ContinueAgentWorkspaceSnapshot> = {
    snapshot?: TSnapshot | null;
    focusInvestigationId?: string | null;
    focusTabId?: string | null;
    previousAgentStepId?: string | null;
    userInstruction?: string | null;
    trigger?: 'user_instruction' | 'continue_from_workspace' | 'continue_from_tab' | null;
};

export type ContinueAgentRunRequestBody<TSnapshot extends ContinueAgentWorkspaceSnapshot> =
    | {
          workspaceSnapshot: TSnapshot & {
              previousAgentStepId: string | null;
          };
          userInstruction?: string;
          focusTabId?: string;
          trigger?: 'user_instruction' | 'continue_from_workspace' | 'continue_from_tab';
      }
    | {
          focusInvestigationId: string;
          userInstruction?: string;
      }
    | {
          focusTabId: string;
          userInstruction?: string;
          trigger?: 'user_instruction' | 'continue_from_workspace' | 'continue_from_tab';
      }
    | {
          mode: 'continue_work';
          userInstruction: string;
          trigger?: 'user_instruction';
      };

export function buildContinueAgentRunRequestBody<TSnapshot extends ContinueAgentWorkspaceSnapshot>(
    input: ContinueAgentRunRequestInput<TSnapshot>,
): ContinueAgentRunRequestBody<TSnapshot> | undefined {
    if (input.snapshot) {
        const userInstruction = input.userInstruction?.trim();
        const focusTabId = input.focusTabId?.trim();
        return {
            workspaceSnapshot: {
                ...input.snapshot,
                previousAgentStepId: input.previousAgentStepId ?? null,
            },
            ...(userInstruction ? { userInstruction } : {}),
            ...(focusTabId ? { focusTabId } : {}),
            ...(input.trigger ? { trigger: input.trigger } : {}),
        };
    }

    const focusInvestigationId = input.focusInvestigationId?.trim();
    if (focusInvestigationId) {
        return {
            focusInvestigationId,
            ...(input.userInstruction?.trim() ? { userInstruction: input.userInstruction.trim() } : {}),
        };
    }

    const focusTabId = input.focusTabId?.trim();
    if (focusTabId) {
        return {
            focusTabId,
            ...(input.userInstruction?.trim() ? { userInstruction: input.userInstruction.trim() } : {}),
            ...(input.trigger ? { trigger: input.trigger } : {}),
        };
    }

    const userInstruction = input.userInstruction?.trim();
    if (userInstruction) {
        return {
            mode: 'continue_work',
            userInstruction,
            trigger: 'user_instruction',
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
