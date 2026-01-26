export type PromptMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type PromptMessage = {
    role: PromptMessageRole;
    content: string;
    name?: string;
};

export type PromptTemplate<TContext = unknown> = (ctx: TContext) => string;

export type PromptEntry<TContext = unknown> = string | PromptTemplate<TContext>;

export type PromptRegistry = Record<string, PromptEntry<any>>;
