import type { DBService } from '@dory/database';
import { NextRequest } from 'next/server';

import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { generateText } from '@/lib/ai/gateway';
import { completeAgentWorkTitle } from '@/lib/work-documents/work-title';

export async function generateAgentWorkTitle(db: DBService, input: { organizationId: string; userId: string; sessionId: string; prompt: string; req: Request }) {
    await completeAgentWorkTitle(db.chat, input, async () => {
        const execution = await resolveAiLanguageModel({
            role: 'title',
            organizationId: input.organizationId,
            requestedModel: null,
            req: new NextRequest(input.req.url, { headers: input.req.headers }),
        });
        const result = await generateText({
            model: execution.model,
            instructions:
                'Name the work requested by the user. Return only a concise task title in the language of their request (e.g. 月度收入分析). Do not answer the request. No quotes, Markdown, data source details or explanation. Maximum 40 characters.',
            prompt: input.prompt.slice(0, 2000),
            maxOutputTokens: 64,
            abortSignal: AbortSignal.timeout(15_000),
            context: {
                organizationId: input.organizationId,
                userId: input.userId,
                feature: 'work_title',
                model: execution.modelName,
                provider: execution.providerKey,
                gateway: execution.gateway,
            },
        });
        return result.text;
    });
}
