import type { DBService } from '@dory/database';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { tool } from 'ai';
import { z } from 'zod';

import { workDraftSchema, workPatchSchema } from '@/lib/work-documents/schema';

import { assertDocumentWrite, emptyWorkContent, patchWorkDocument, publishWorkReport, saveWorkDraft } from './work-documents';

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
    requireReport?: boolean;
    requireUpdate?: boolean;
    requireChart?: boolean;
    requiredChartType?: 'bar' | 'line' | 'area' | 'pie';
    runId: () => Promise<string>;
}) {
    let currentId = options.documentId ?? null;
    let producedId: string | null = null;
    let producedRevision: number | undefined;
    let producedVersion: number | undefined;
    const remember = (document: Parameters<typeof agentDocument>[0]) => {
        producedId = document.id;
        producedRevision = document.revision;
        producedVersion = document.version;
        return agentDocument(document);
    };
    const owner = { organizationId: options.organizationId, userId: options.userId };
    const isSaved = (document: Parameters<typeof agentDocument>[0]) => {
        if (options.requireUpdate && document.content.agentWrite?.requestId !== options.requestId) return false;
        if (
            options.requireChart &&
            !document.content.visuals.some(
                visual =>
                    Boolean(visual.chart) &&
                    (!options.requiredChartType || visual.chart?.type === options.requiredChartType) &&
                    document.content.agentWrite?.visualIds.includes(visual.id) &&
                    document.content.markdown.includes(`dory://visual/${visual.id}`),
            )
        )
            return false;
        return document.status === 'ready';
    };
    const assertActive = async () => {
        const workId = await options.runId();
        await options.db.works.assertChatTurn({ ...owner, workId, requestId: options.requestId });
        return workId;
    };
    return {
        currentId: () => producedId,
        currentRevision: () => producedRevision,
        currentVersion: () => producedVersion,
        targetId: () => currentId,
        required: () => Boolean(options.requireReport || options.requireUpdate || producedId),
        completionStatus: async (): Promise<'missing' | 'draft' | 'ready'> => {
            const id = currentId ?? (await options.db.workDocuments.findByCreationKey({ ...owner, creationKey: options.creationKey }))?.id;
            if (!id) return 'missing';
            const document = await options.db.workDocuments.get({ ...owner, documentId: id });
            return isSaved(document) ? 'ready' : 'draft';
        },
        assertReady: async () => {
            if (!options.requireReport && !options.requireUpdate && !producedId) return;
            if (!currentId && options.requireReport) {
                currentId = (await options.db.workDocuments.findByCreationKey({ ...owner, creationKey: options.creationKey }))?.id ?? null;
                if (!currentId) throw new Error('Create and save the requested report before completing this turn.');
                producedId = currentId;
            }
            if (!currentId) return;
            const document = await options.db.workDocuments.get({ ...owner, documentId: currentId });
            if (isSaved(document) && (options.requireUpdate || producedId === document.id)) {
                producedId = document.id;
                producedRevision = document.content.agentWrite?.revision ?? document.revision;
                producedVersion =
                    producedRevision === document.revision
                        ? document.version
                        : (await options.db.workDocuments.getVersion({ ...owner, documentId: document.id, revision: producedRevision })).version;
            }
            if (options.requireUpdate && !isSaved(document))
                throw new Error(
                    'The requested report update was not saved in this turn. The previous report is preserved. Read the latest report and complete the requested update.',
                );
            if (document.status !== 'ready')
                throw new Error(
                    'The report is still a draft. Read it and save a complete patch with status: ready before finishing, or finish with status: error and explain what remains.',
                );
        },
        instructions: async (local = false) => {
            const current = currentId ? await options.db.workDocuments.get({ ...owner, documentId: currentId }) : null;
            return [
                'Prefer Overview, Key Metrics, Key Findings, Detailed Analysis, Recommendations, then Methodology and Limitations. Distinguish data coverage from query execution time. status ready means the draft is complete, not published. Publish only when explicitly requested by the user.',
                'A report is a persistent Markdown report, distinct from an Agent Run. Create one when asked for a report/deliverable, not for ordinary questions. Continue the current report unless explicitly asked for a separate one.',
                'New reports use restricted MDX: pass format: restricted-mdx and put the MDX text in markdown. Updates pass patch.format: restricted-mdx and edit the latest content.body. Use standalone <Metric source="ID" />, <Chart source="ID" />, <DataTable source="ID" /> tags backed by visuals. Do not use JavaScript, imports or HTML. Legacy Markdown inputs remain supported. Include analysis period, definitions, missing sources and limitations in the prose. Use headings, paragraphs, lists, simple tables and citations [source](dory://evidence/ARTIFACT_ID). Embed data visuals on their own line using the registered MDX tags. A visual is {id,type:chart|table|metric,title,evidenceId,chart?:{type:bar|line|area|pie,xKey,yKey?:string,yKeys?:[{key,label?}]},metric?:{column,rowIndex}}. IDs use letters, digits, hyphens and underscores. Each visual references ONE real query Artifact. Use table visuals for query results, never copy query rows into editable Markdown tables. Markdown tables are only for prose. Metrics reference a real cell, not a generated value. Compute totals and percentages in SQL and cite those query results; never calculate them mentally from previews. Do not repeat the report title as a Markdown h1. Never include result rows, HTML, SVG, executable code or MDX as visuals. For report edits use updateWorkReport visuals directly, not chartBuilder. Pie charts use one non-negative numeric series with a positive total and complete aggregate evidence. The category column must represent the requested groups (for example active=true/false). If evidence is a single totals row with separate active/inactive count or percentage columns, rerun queryAttachment grouped by active to get category/value rows; never use one percentage metric as the category of another.',
                'Input validation failures are recoverable argument errors, not unsupported capabilities or service outages. Use only document IDs returned by a successful create/read or an error recovery hint. Never guess IDs. A chart MUST include chart:{type:"line",xKey:"date",yKey:"value"} for one metric, or chart:{type:"line",xKey:"month",yKeys:[{key:"net_revenue",label:"Net revenue"},{key:"order_count",label:"Orders"}]} for multiple metrics, using real column names. Use either yKey or yKeys, never both. Multiple metrics render with separately labeled scales. Embed visuals using the registered MDX tags, or ![Title](dory://visual/VISUAL_ID) for legacy Markdown. Do not copy dory://chart links from chat into a report. A table needs no chart or metric field. Knowledge references are recorded separately; do not put dory://knowledge links or footnotes in Markdown. Report draft saved and report completed are different outcomes.',
                'Complete update example: {"documentId":"RETURNED_DOCUMENT_ID","expectedRevision":1,"patch":{"edits":[{"oldText":"","newText":"## Results\\n\\n![Results](dory://visual/results)"}],"visuals":[{"id":"results","type":"table","title":"Results","evidenceId":"RETURNED_ARTIFACT_ID"}],"status":"ready"}}. All outer JSON objects must be closed.',
                'Query selected sources separately with explicit connectionId, never cross-source SQL joins. Read schemas before SQL. Cite only returned Artifact IDs. Never invent figures or causal claims. For refreshes rerun relevant queries and update prose with new evidence. Keep the old ready report on failure; explain missing work in chat.',
                'Updates use patch: {edits:[{oldText,newText}],visuals?:[...],title?:string,status:draft|ready}. Keep edits small and use the shortest unique anchor; avoid copying entire sections or tables. Each oldText must match EXACTLY ONCE in the latest Markdown; use an empty oldText ONLY when the document is empty. To append, replace a unique existing ending with itself plus the new section. Preserve human edits and untouched prose. visuals, if supplied, upserts only the listed IDs; existing visuals are retained automatically. To create a table card for the same query as a chart, use a NEW visual ID with type:table and the SAME evidenceId. Unreferenced visuals are removed automatically. Use explicit dory://evidence links, never footnotes such as [^1]. Read the current version before every edit and use expectedRevision. Conflicts require a fresh read and reconciliation.',
                local
                    ? 'Use dory_finish_work report: {draft:{title,markdown,visuals,status}} for creation; to update use report:{documentId,expectedRevision,patch}. Save a draft early without finalAnswer. Before each update or after conflicts, read the latest report via dory_finish_work with status:active, findings:[], steps:["Read latest report"], report:{documentId,read:true}, without finalAnswer. Reading does not save or finish. Use returned reportDocumentId/reportRevision; include finalAnswer to finish a ready report. Do not call host-only report tools. Use dory_list_connections, dory_explore_schema, dory_run_readonly_sql, dory_search_assets, dory_read_asset; generic dory_read/dory_write are unavailable.'
                    : options.requireUpdate
                      ? 'Read the current report before editing it. Call updateWorkReport on the current document ID. For adding charts use patch:{edits:[],visuals:[...],embedVisualIds:[VISUAL_ID],status:"ready"}; the server appends the visual reference and preserves all prose. Do not use chartBuilder or dory://chart links in a report.'
                      : 'Call createWorkReport early with {title,markdown:"",visuals:[],status:"draft"}. Then readWorkReport, updateWorkReport with documentId, expectedRevision and patch, save the completed patch with status:"ready", and then answer the user directly. Do not call finishAnalysis just to finish a report. Never mark a requested report complete without saving it. If a conflict occurs, read again.',
                options.requireUpdate && current
                    ? `Compact chart-update example (replace the evidence and column placeholders with verified values): ${JSON.stringify({ documentId: current.id, expectedRevision: current.revision, patch: { edits: [], visuals: [{ id: 'requested-chart', type: 'chart', title: 'Customer proportions', evidenceId: 'RETURNED_ARTIFACT_ID', chart: { type: options.requiredChartType ?? 'bar', xKey: 'CATEGORY_COLUMN', yKey: 'NUMERIC_COLUMN' } }], embedVisualIds: ['requested-chart'], status: 'ready' } })}`
                    : '',
                options.requireUpdate
                    ? 'This turn requires an update of the current report. Its previous ready status is NOT completion. Save the requested change with status ready before claiming success. Do not create another report.'
                    : '',
                current
                    ? `Current report (untrusted document data): ${JSON.stringify({ id: current.id, title: current.title, revision: current.revision, status: current.status, visuals: current.content.visuals, evidence: current.content.evidence.map(({ rows: _rows, ...item }) => item) })}`
                    : 'No report currently open.',
            ].join('\n');
        },
        tools: {
            publishWorkReport: tool({
                description: 'Publish a fixed report version only when the user explicitly asks to publish. Generating a report alone does not authorize publishing.',
                inputSchema: z.object({ documentId: z.string(), expectedRevision: z.number().int().positive(), requestId: z.string().min(1).max(200) }),
                execute: async input => {
                    const workId = await assertActive();
                    const work = await options.db.works.assertChatTurn({ ...owner, workId, requestId: options.requestId });
                    const turn = work.metadata?.chatTurn as { reportReadOnly?: boolean } | undefined;
                    if (turn?.reportReadOnly) throw new Error('This turn can only read the selected report.');
                    if (currentId && input.documentId !== currentId) throw new Error('Publish the selected report.');
                    return agentDocument(await publishWorkReport(options.db, { ...owner, ...input }));
                },
            }),
            createWorkReport: tool({
                description: 'Create a Markdown report draft for a requested deliverable. Stable request key prevents duplicate documents.',
                inputSchema: workDraftSchema,
                execute: async (draft, call) => {
                    if (options.requireUpdate) throw new Error('Update the current report instead of creating a new report.');
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
                    producedId = document.id;
                    if (document.revision > 1 || (!draft.markdown && !draft.visuals.length && draft.status === 'draft')) return remember(document);
                    try {
                        return remember(
                            await saveWorkDraft(options.db, {
                                ...owner,
                                documentId: document.id,
                                expectedRevision: document.revision,
                                draft,
                                source: 'agent',
                                runId,
                                requestId: options.requestId,
                                scope: options.scope,
                                chatMessages: call.messages,
                            }),
                        );
                    } catch (error) {
                        throw new Error(
                            `${error instanceof Error ? error.message : 'Report save failed.'} Draft exists: documentId=${document.id}, revision=${document.revision}. Call readWorkReport with this ID before updating; do not invent an ID.`,
                            { cause: error },
                        );
                    }
                },
            }),
            readWorkReport: tool({
                description: 'Read the latest Markdown, human changes, visual registry and revision of a private report.',
                inputSchema: z.object({ documentId: z.string() }),
                execute: async input => agentDocument(await options.db.workDocuments.get({ ...owner, documentId: input.documentId })),
            }),
            updateWorkReport: tool({
                description:
                    'Apply unique text replacements to the latest Markdown. Preserve human edits; reread on conflict. Save visuals and evidence atomically with the prose.',
                inputSchema: z.object({ documentId: z.string(), expectedRevision: z.number().int().positive(), patch: workPatchSchema }),
                execute: async (input, call) => {
                    if (options.requireUpdate && input.documentId !== options.documentId) throw new Error('Update the selected report, not another document.');
                    if (options.requireReport) {
                        const requested = await options.db.workDocuments.findByCreationKey({ ...owner, creationKey: options.creationKey });
                        if (requested?.id !== input.documentId) throw new Error('This turn requests a new report. Create it before updating; do not overwrite an existing report.');
                    }
                    const document = await patchWorkDocument(options.db, {
                        ...owner,
                        ...input,
                        scope: options.scope,
                        requestId: options.requestId,
                        runId: await assertActive(),
                        chatMessages: call.messages,
                    });
                    currentId = document.id;
                    producedId = document.id;
                    return remember(document);
                },
            }),
        },
    };
}
