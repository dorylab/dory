import 'server-only';

import { z } from 'zod';
import { generateText } from '@/lib/ai/gateway';
import { getModelBundle } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
export { isMissingAiEnvError } from '@/lib/ai/errors';

export async function runLLMJson<T extends z.ZodTypeAny>(args: { prompt: string; schema: T; temperature?: number; maxRetries?: number }) {
    const { prompt, schema, temperature = 0, maxRetries = 1 } = args;

    let lastErr: unknown = null;

    for (let i = 0; i <= maxRetries; i++) {
        try {
            const { model, preset } = getModelBundle('action');
            const system = compileSystemPrompt(preset.system);
            const { text } = await generateText({
                model,
                system,
                prompt,
                temperature: temperature ?? preset.temperature,
                context: {
                    feature: 'copilot_action',
                    model: preset.model,
                },
            });

            const json = extractJsonObject(text);
            const parsed = schema.parse(JSON.parse(json));
            return parsed as z.infer<T>;
        } catch (e) {
            lastErr = e;
        }
    }

    throw lastErr;
}

function extractJsonObject(text: string) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return text.trim();
    return text.slice(start, end + 1).trim();
}
