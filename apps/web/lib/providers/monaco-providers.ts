// lib/monacoProviders.ts
import * as monaco from 'monaco-editor';

type SchemaMap = Record<string, string[]>;
const schemaCache = new Map<string, SchemaMap>();
const aiCache = new Map<string, monaco.languages.CompletionItem[]>();

// export async function loadSchema(connectionId: string): Promise<SchemaMap> {
//     if (schemaCache.has(connectionId)) {
//         return schemaCache.get(connectionId)!;
//     }

//     try {
//         const res = await authFetch('/api/schema', {
//             method: 'GET',
//             headers: {
//                 'X-Connection-ID': connectionId,
//             },
//         });

//         if (res.ok) {
//             const payload = (await res.json()) as { ok: boolean; schema: SchemaMap };
//             if (payload?.ok) {
//                 schemaCache.set(connectionId, payload.schema);
//                 return payload.schema;
//             }
//         }
//     } catch (e) {
//         console.warn(e);
//     }

//     return {};
// }

export function registerSQLCompletion(monacoInstance: typeof monaco, connectionId: string) {
    monacoInstance.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ['.', ' ', '(', ','],

        provideCompletionItems: async (model, position) => {
            console.log('SQL completion triggered at', position);
            console.log('connectionId', connectionId);
            if (!connectionId) return { suggestions: [] };

            const wordInfo = model.getWordUntilPosition(position);
            const range = new monacoInstance.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn);

            const textBefore = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            const lower = textBefore.toLowerCase();
            const suggestions: monaco.languages.CompletionItem[] = [];

            // Load schema from cache or remote
            // const schema = await loadSchema(connectionId);
            const schema = [] as any;

            // Suggest table names after FROM / JOIN
            if (/\b(from|join)\s*$/.test(lower)) {
                for (const table of Object.keys(schema)) {
                    suggestions.push({
                        label: table,
                        kind: monacoInstance.languages.CompletionItemKind.Field,
                        insertText: table,
                        range,
                        detail: 'table',
                    });
                }
            } else {
                // Suggest columns after table.
                const match = /([a-zA-Z0-9_]+)\.$/.exec(textBefore);
                if (match) {
                    const table = match[1];
                    const columns = schema[table];
                    if (columns) {
                        for (const col of columns) {
                            suggestions.push({
                                label: col,
                                kind: monacoInstance.languages.CompletionItemKind.Property,
                                insertText: col,
                                range,
                                detail: `${table}.column`,
                            });
                        }
                    }
                }
            }

            // AI completion
            // const ctx = textBefore.slice(-2000);
            // const cacheKey = `${connectionId}::${ctx}`;

            // const aiPromise = (async () => {
            //     if (aiCache.has(cacheKey)) return aiCache.get(cacheKey)!;

            //     try {
            //         const res = await authFetch('/api/ai-complete', {
            //             method: 'POST',
            //             headers: {
            //                 'Content-Type': 'application/json',
            //                 'X-Connection-ID': connectionId,
            //             },
            //             body: JSON.stringify({
            //                 prompt: ctx,
            //                 language: 'mysql',
            //                 maxCandidates: 6,
            //             }),
            //         });

            //         if (!res.ok) return [];
            //         const payload = (await res.json()) as { ok?: boolean; suggestions?: any[] };
            //         if (!payload?.ok) return [];
            //
            //         const items = (payload.suggestions as any[]).map((s, i) => ({
            //             label: s.label ?? s.insertText,
            //             kind: monacoInstance.languages.CompletionItemKind.Function,
            //             insertText: s.insertText,
            //             documentation: s.detail ?? '',
            //             range,
            //             sortText: 'z' + String(i).padStart(3, '0'),
            //         })) as monaco.languages.CompletionItem[];

            //         aiCache.set(cacheKey, items);
            //         return items;
            //     } catch (e) {
            //         console.warn(e);
            //         return [];
            //     }
            // })();

            const combined: monaco.languages.CompletionList = {
                suggestions,
                incomplete: true,
            };

            // (combined as any)._aiPromise = aiPromise;
            return combined;
        },

        resolveCompletionItem: async item => item,
    });
}
