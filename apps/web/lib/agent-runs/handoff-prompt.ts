export type AgentRunHandoffPromptInput = {
    workId: string;
    connectionId?: string | null;
    workspaceUrl?: string | null;
    title?: string | null;
    connectionName?: string | null;
    tabCount?: number | null;
    sqlExecutionCount?: number | null;
};

function optionalLine(label: string, value: string | number | null | undefined) {
    if (value === null || typeof value === 'undefined' || value === '') return null;
    return `- ${label}: ${value}`;
}

export function buildAgentRunHandoffPrompt(input: AgentRunHandoffPromptInput) {
    const title = input.title?.trim() || 'Agent Run';
    const connectionLabel = input.connectionName?.trim() || input.connectionId?.trim() || 'current Agent Run connection';
    const lines = [
        `Continue this Dory Agent Run from the existing human-edited workspace.`,
        ``,
        `Context:`,
        optionalLine('Work ID', input.workId),
        optionalLine('Title', title),
        optionalLine('Connection ID', input.connectionId),
        optionalLine('Data source', connectionLabel),
        optionalLine('Workspace URL', input.workspaceUrl),
        optionalLine('Workspace tabs', input.tabCount),
        optionalLine('SQL runs already captured', input.sqlExecutionCount),
        ``,
        `Instructions for the external Agent:`,
        `1. Use the Dory MCP tools with workId "${input.workId}". Do not create a new Dory work unless this work is unavailable.`,
        input.connectionId
            ? `2. List workspace tabs first by calling dory_workspace_tabs with operation "list", connectionId "${input.connectionId}", and workId "${input.workId}".`
            : `2. List workspace tabs first with dory_workspace_tabs using workId "${input.workId}" and the Agent Run connection from the workspace context.`,
        `3. Treat the current workspace tabs as the user's latest context, including human edits made after the original Agent Run.`,
        `4. Continue the task from that state. Update or create workspace tabs as needed.`,
        `5. When calling dory_finish_work, summarize only the new work completed in this continuation. Provide findings for analytical conclusions and steps for execution actions; Dory appends both to the existing Run summary.`,
    ].filter((line): line is string => line !== null);

    return lines.join('\n');
}
