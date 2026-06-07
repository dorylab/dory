import { z } from 'zod';

export const workStatusSchema = z.enum(['draft', 'running', 'completed']);
export const workCreatorSchema = z.enum(['user', 'agent']);
export const workRunStatusSchema = z.enum(['running', 'completed', 'failed']);
export const workRunEventTypeSchema = z.enum([
    'message',
    'tool_call',
    'tool_result',
    'sql_executed',
    'investigation_created',
    'investigation_updated',
    'conclusion_updated',
    'error',
    'completed',
]);
export const workRunEventRoleSchema = z.enum(['user', 'agent', 'tool', 'system']);

export const workOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    title: z.string(),
    status: workStatusSchema,
    goal: z.string(),
    conclusion: z.string().nullable(),
    connectionId: z.string(),
    createdBy: workCreatorSchema,
    createdByUserId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const workInvestigationOutputSchema = z.object({
    id: z.string(),
    workId: z.string(),
    organizationId: z.string(),
    connectionId: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    status: workStatusSchema,
    linkedTabId: z.string().nullable(),
    lastQueryAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const workRunOutputSchema = z.object({
    id: z.string(),
    workId: z.string(),
    organizationId: z.string(),
    connectionId: z.string(),
    status: workRunStatusSchema,
    previousWorkStatus: workStatusSchema,
    createdByUserId: z.string(),
    startedAt: z.date(),
    completedAt: z.date().nullable(),
    error: z.string().nullable(),
});

export const workRunEventOutputSchema = z.object({
    id: z.string(),
    runId: z.string(),
    workId: z.string(),
    organizationId: z.string(),
    type: workRunEventTypeSchema,
    role: workRunEventRoleSchema,
    content: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.date(),
});
