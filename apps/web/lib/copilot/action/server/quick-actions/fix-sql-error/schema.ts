import 'server-only';

import { z } from 'zod';

export const FixSqlErrorOutputSchema = z.object({
    title: z.string().min(1),
    explanation: z.string().min(1),
    fixedSql: z.string().min(1),
    risk: z.enum(['low', 'medium', 'high']).default('low'),
});

export type FixSqlErrorOutput = z.infer<typeof FixSqlErrorOutputSchema>;
