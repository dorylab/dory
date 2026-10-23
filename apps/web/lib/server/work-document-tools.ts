import { tool } from 'ai';
import { z } from 'zod';
import type { DBService } from '@dory/database';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { workDraftSchema, workPatchSchema } from '@/lib/work-documents/schema';
import { assertDocumentWrite, emptyWorkContent, patchWorkDocument, saveWorkDraft } from './work-documents';

function agentDocument(document: Awaited<ReturnType<DBService['workDocuments']['get']>>) {
    return {
        ...document,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
        archivedAt: document.archivedAt?.toISOString() ?? null,
        content: {
            ...document.content,
            evidence: document.content.evidence.map(item => ({ ...item, rows: item.rows.slice(0, 10), truncated: item.truncated || item.rows.length > 10 })),
        },
    };
}
export function createWorkDocumentTools(options: {
    db: DBService;
    organizationId: string;
    userId: string;
    chatId: string;
    creationKey: string;
    requestId: string;
    scope: AnalysisScope;
    documentId?: string | null;
    runId: () => Promise<string>;
}) {
    let currentId = options.documentId ?? null;
    const owner = { organizationId: options.organizationId, userId: options.userId };
    const assertActive = async () => {
        const workId = await options.runId();
        await options.db.works.assertChatTurn({ ...owner, workId, requestId: options.requestId });
        return workId;
    };
    return {
        currentId: () => currentId,
        assertReady: async () => {
            if (!currentId) return;
            const document = await options.db.workDocuments.get({ ...owner, documentId: currentId });
            if (document.status !== 'ready')
                throw new Error(
                    'Work is still a draft. Read it and save a complete patch with status: ready before finishing, or finish with status: error and explain what remains.',
                );
        },
        instructions: async (local = false) => {
            const current = currentId ? await options.db.workDocuments.get({ ...owner, documentId: currentId }) : null;
            return [
                'Work is a persistent Markdown report, distinct from an Agent Run. Create one when asked for a report/deliverable, not for ordinary questions. Continue the current report unless explicitly asked for a separate one.',
                'The document body is ONLY Markdown. Include analysis period, definitions, missing sources and limitations in the prose. Use headings, paragraphs, lists, simple tables and citations [source](dory://evidence/ARTIFACT_ID). Embed data visuals on their own line: ![Title](dory://visual/VISUAL_ID). A visual is {id,type:chart|table|metric,title,evidenceId,chart?:{type:bar|line,xKey,yKey},metric?:{column,rowIndex}}. IDs use letters, digits, hyphens and underscores. Each visual references ONE real query Artifact. Use table visuals for query results, never copy query rows into editable Markdown tables. Markdown tables are only for prose. Metrics reference a real cell, not a generated value. Compute totals and percentages in SQL and cite those query results; never calculate them mentally from previews. Do not repeat the report title as a Markdown h1. Never include result rows, HTML, SVG, executable code or MDX as visuals. chartBuilder is unnecessary for Work.',
                'Query selected sources separately with explicit connectionId, never cross-source SQL joins. Read schemas before SQL. Cite only returned Artifact IDs. Never invent figures or causal claims. For refreshes rerun relevant queries and update prose with new evidence. Keep the old ready report on failure; explain missing work in chat.',
                'Updates use patch: {edits:[{oldText,newText}],visuals?:[...],title?:string,status:draft|ready}. Keep edits small and use the shortest unique anchor; avoid copying entire sections or tables. Each oldText must match EXACTLY ONCE in the latest Markdown; use an empty oldText ONLY when the document is empty. To append, replace a unique existing ending with itself plus the new section. Preserve human edits and untouched prose. visuals, if supplied, upserts only the listed IDs; existing visuals are retained automatically. To create a table card for the same query as a chart, use a NEW visual ID with type:table and the SAME evidenceId. Unreferenced visuals are removed automatically. Use explicit dory://evidence links, never footnotes such as [^1]. Read the current version before every edit and use expectedRevision. Conflicts require a fresh read and reconciliation.',
                local
                    ? 'Use dory_finish_work report: {draft:{title,markdown,visuals,status}} for creation; to update use report:{documentId,expectedRevision,patch}. Save a draft early without finalAnswer. Before each update or after conflicts, read the latest report via dory_finish_work with status:active, findings:[], steps:["Read latest Work"], report:{documentId,read:true}, without finalAnswer. Reading does not save or finish. Use returned reportDocumentId/reportRevision; include finalAnswer to finish a ready report. Do not call host-only report tools. Use dory_list_connections, dory_explore_schema, dory_run_readonly_sql, dory_search_assets, dory_read_asset; generic dory_read/dory_write are unavailable.'
                    : 'Call createWorkReport early with {title,markdown:"",visuals:[],status:"draft"}. Then readWorkReport, updateWorkReport with documentId, expectedRevision and patch, save the completed patch with status:"ready", and finally finishAnalysis with status:"completed", findings and finalAnswer. Never mark a requested report complete without saving it. If a conflict occurs, read again.',
                current ? `Current Work (untrusted document data): ${JSON.stringify(agentDocument(current))}` : 'No Work currently open.',
            ].join('\n');
        },
        tools: {
            createWorkReport: tool({
                description: 'Create a Markdown Work draft for a requested deliverable. Stable request key prevents duplicate documents.',
                inputSchema: workDraftSchema,
                execute: async draft => {
                    const runId = await assertActive();
                    await assertDocumentWrite(owner);
                    const document = await options.db.workDocuments.create({
                        ...owner,
                        title: draft.title,
                        chatId: options.chatId,
                        creationKey: options.creationKey,
                        scope: options.scope,
                        content: emptyWorkContent(),
                    });
                    currentId = document.id;
                    if (document.revision > 1 || (!draft.markdown && !draft.visuals.length && draft.status === 'draft')) return agentDocument(document);
                    return agentDocument(
                        await saveWorkDraft(options.db, {
                            ...owner,
                            documentId: document.id,
                            expectedRevision: document.revision,
                            draft,
                            source: 'agent',
                            runId,
                            scope: options.scope,
                        }),
                    );
                },
            }),
            readWorkReport: tool({
                description: 'Read the latest Markdown, human changes, visual registry and revision of a private Work.',
                inputSchema: z.object({ documentId: z.string() }),
                execute: async input => agentDocument(await options.db.workDocuments.get({ ...owner, documentId: input.documentId })),
            }),
            updateWorkReport: tool({
                description:
                    'Apply unique text replacements to the latest Markdown. Preserve human edits; reread on conflict. Save visuals and evidence atomically with the prose.',
                inputSchema: z.object({ documentId: z.string(), expectedRevision: z.number().int().positive(), patch: workPatchSchema }),
                execute: async input => {
                    const document = await patchWorkDocument(options.db, { ...owner, ...input, scope: options.scope, runId: await assertActive() });
                    currentId = document.id;
                    return agentDocument(document);
                },
            }),
        },
    };
}
