import { z } from 'zod';
import { normalizeWorkspaceScope, type WorkspaceScope } from '@dory/shared/types/tabs';

export const workspaceScopeInputSchema = z
    .discriminatedUnion('type', [
        z.object({
            type: z.literal('connection'),
        }),
        z.object({
            type: z.literal('work_investigation'),
            workId: z.string().min(1),
            investigationId: z.string().min(1),
        }),
    ])
    .optional()
    .nullable();

export function normalizeWorkspaceScopeInput(scope?: z.infer<typeof workspaceScopeInputSchema>): WorkspaceScope {
    return normalizeWorkspaceScope(scope ?? null);
}
