import { NextRequest } from 'next/server';
import { generateText } from '@/lib/ai/gateway';
import { getModelBundle, getProviderModel } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

export const POST = withUserAndTeamHandler(async ({ req }) => {
    try {
        const locale = await getApiLocale();
        const { sql, database, model: requestedModel } = (await req.json()) as {
            sql: string;
            database?: string | null;
            model?: string | null;
        };
        const { model: defaultModel, preset } = getModelBundle('title');
        const providerModelName = requestedModel || preset.model;
        const model = providerModelName === preset.model ? defaultModel : getProviderModel(providerModelName);

        if (!sql || !sql.trim()) {
            return new Response(JSON.stringify({ title: null }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const prompt = buildTabTitlePrompt({ sql, database, locale });

        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt,
            temperature: preset.temperature,
            context: {
                feature: 'tab_title',
                model: providerModelName,
            },
        });

        const title = text.trim();

        return new Response(JSON.stringify({ title }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[api/ai/tab-title] error:', error);
        return new Response(JSON.stringify({ title: null }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
