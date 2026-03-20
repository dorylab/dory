// chat/copilot/action-bridge.ts
export type CopilotAction =
    | { type: 'sql.replace'; sql: string }
    | { type: 'sql.insert'; sql: string; position?: 'cursor' | 'end' }
    | { type: 'sql.newTab'; sql: string; title?: string }
    | { type: 'sql.run'; sql?: string } 
    ;

export type CopilotActionExecutor = (action: CopilotAction) => void | Promise<void>;
