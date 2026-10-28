import { z } from 'zod';

import { knowledgeDefinitionSchema } from './shared';

const suggestionSchema = knowledgeDefinitionSchema.extend({ id: z.string().min(1) });

export function parseKnowledgeSuggestions(text: string, allowedSourceIds: ReadonlySet<string>) {
    const decoded: unknown = JSON.parse(text.trim());
    const response = z.object({ suggestions: z.array(z.unknown()) }).parse(decoded);
    return response.suggestions
        .map((suggestion, index) => {
            const item = z.record(z.string(), z.unknown()).parse(suggestion);
            return suggestionSchema.parse({ ...item, id: typeof item.id === 'string' && item.id ? item.id : `suggestion:${index}` });
        })
        .filter(suggestion => allowedSourceIds.has(suggestion.sourceConnectionId));
}

export async function generateKnowledgeSuggestions(generate: (retry: boolean) => Promise<{ text: string }>, allowedSourceIds: ReadonlySet<string>) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = await generate(attempt > 0);
        try {
            return parseKnowledgeSuggestions(result.text, allowedSourceIds);
        } catch {
            if (attempt === 1) throw new Error('The AI returned suggestions in an invalid format. Please try again.');
        }
    }
    throw new Error('The AI returned suggestions in an invalid format. Please try again.');
}
