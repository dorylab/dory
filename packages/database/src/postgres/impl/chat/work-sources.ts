import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import type { WorkVisual } from '@dory/shared/types/work-document';

import { artifacts, chatMessages, chatSessions, resultSets, workDocuments, works } from '../../schemas';

/** Metadata only: never load result rows or entire chat histories for the work list. */
export async function readWorkSources(db: PostgresDBClient, owner: { organizationId: string; userId: string }, chatIds: string[]) {
    if (!chatIds.length) return { runs: [], reports: [], artifacts: [], messages: [] };
    const owned = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(
            and(
                eq(chatSessions.organizationId, owner.organizationId),
                eq(chatSessions.userId, owner.userId),
                eq(chatSessions.type, 'global'),
                isNull(chatSessions.archivedAt),
                inArray(chatSessions.id, chatIds),
            ),
        );
    chatIds = owned.map(session => session.id);
    if (!chatIds.length) return { runs: [], reports: [], artifacts: [], messages: [] };
    const [runs, reports, messages] = await Promise.all([
        db
            .select({ id: works.workId, externalSessionId: works.externalSessionId, status: works.status, metadata: works.metadata, updatedAt: works.updatedAt })
            .from(works)
            .where(
                and(
                    eq(works.organizationId, owner.organizationId),
                    eq(works.userId, owner.userId),
                    isNull(works.archivedAt),
                    or(
                        inArray(
                            works.externalSessionId,
                            chatIds.map(id => `chat:${id}`),
                        ),
                        inArray(sql<string>`${works.metadata}->>'chatId'`, chatIds),
                        inArray(
                            works.workId,
                            db
                                .select({ id: sql<string>`${chatMessages.metadata}->>'agentRunId'` })
                                .from(chatMessages)
                                .where(and(eq(chatMessages.organizationId, owner.organizationId), inArray(chatMessages.sessionId, chatIds))),
                        ),
                    ),
                ),
            ),
        db
            .select({
                id: workDocuments.id,
                chatId: workDocuments.chatId,
                title: workDocuments.title,
                status: workDocuments.status,
                visuals: sql<WorkVisual[]>`coalesce(${workDocuments.content}->'visuals', '[]'::jsonb)`,
                updatedAt: workDocuments.updatedAt,
            })
            .from(workDocuments)
            .where(
                and(
                    eq(workDocuments.organizationId, owner.organizationId),
                    eq(workDocuments.userId, owner.userId),
                    inArray(workDocuments.chatId, chatIds),
                    isNull(workDocuments.archivedAt),
                ),
            ),
        db
            .select({
                id: chatMessages.id,
                chatId: chatMessages.sessionId,
                runId: sql<string | null>`${chatMessages.metadata}->>'agentRunId'`,
                createdAt: chatMessages.createdAt,
                charts: sql<Array<{ toolCallId: string; title: string | null; available: boolean }>>`coalesce((
                select jsonb_agg(jsonb_build_object('toolCallId', part->>'toolCallId', 'title', output->>'title',
                    'available', coalesce(output->>'dataState', 'ready') = 'ready'
                        and case when jsonb_typeof(output->'data') = 'array' then jsonb_array_length(output->'data') > 0 else false end))
                from jsonb_array_elements(case when jsonb_typeof(${chatMessages.parts}) = 'array' then ${chatMessages.parts} else '[]'::jsonb end) part
                cross join lateral (select coalesce(nullif(part->'output', 'null'::jsonb), nullif(part->'result', 'null'::jsonb), part->'data', part->'value') as wrapped) raw
                cross join lateral (select case when wrapped->>'type' = 'json' then wrapped->'value' else wrapped end as output) normalized
                where output->>'type' = 'chart' and part->>'toolCallId' is not null
            ), '[]'::jsonb)`,
            })
            .from(chatMessages)
            .where(and(eq(chatMessages.organizationId, owner.organizationId), eq(chatMessages.role, 'assistant'), inArray(chatMessages.sessionId, chatIds))),
    ]);
    const runIds = runs.map(run => run.id);
    const linkedArtifacts = runIds.length
        ? await db
              .select({
                  id: artifacts.id,
                  title: artifacts.title,
                  type: artifacts.type,
                  status: artifacts.status,
                  workId: artifacts.workId,
                  agentRunId: artifacts.agentRunId,
                  sourceResultSetId: artifacts.sourceResultSetId,
                  resourceId: artifacts.resourceId,
                  expiresAt: artifacts.expiresAt,
                  resultExpiresAt: resultSets.expiresAt,
                  updatedAt: artifacts.updatedAt,
                  dataAvailability: resultSets.dataAvailability,
                  resultStatus: resultSets.status,
              })
              .from(artifacts)
              .leftJoin(resultSets, and(eq(resultSets.id, artifacts.sourceResultSetId), eq(resultSets.organizationId, owner.organizationId)))
              .where(
                  and(
                      eq(artifacts.organizationId, owner.organizationId),
                      inArray(artifacts.type, ['chart', 'result_set']),
                      or(inArray(artifacts.workId, runIds), inArray(artifacts.agentRunId, runIds)),
                  ),
              )
        : [];
    return { runs, reports, artifacts: linkedArtifacts, messages };
}
