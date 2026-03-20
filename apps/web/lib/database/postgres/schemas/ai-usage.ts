import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@/lib/id';

export const aiUsageEvents = pgTable(
    'ai_usage_events',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        requestId: text('request_id').notNull(),

        organizationId: text('organization_id'),
        userId: text('user_id'),

        feature: text('feature'),
        model: text('model'),
        promptVersion: integer('prompt_version'),
        algoVersion: integer('algo_version'),
        status: text('status').$type<'ok' | 'error' | 'aborted'>().notNull().default('ok'),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),

        gateway: text('gateway'),
        provider: text('provider'),
        costMicros: integer('cost_micros'),

        traceId: text('trace_id'),
        spanId: text('span_id'),

        inputTokens: integer('input_tokens'),
        outputTokens: integer('output_tokens'),
        reasoningTokens: integer('reasoning_tokens'),
        cachedInputTokens: integer('cached_input_tokens'),
        totalTokens: integer('total_tokens'),
        usageJson: jsonb('usage_json').$type<Record<string, unknown> | null>(),

        latencyMs: integer('latency_ms'),
        fromCache: boolean('from_cache').notNull().default(false),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        check('ck_ai_usage_events_status', sql`${t.status} in ('ok', 'error', 'aborted')`),
        uniqueIndex('uidx_ai_usage_events_request_id').on(t.requestId),
        index('idx_ai_usage_events_organization_created').on(t.organizationId, t.createdAt),
        index('idx_ai_usage_events_organization_created_total').on(t.organizationId, t.createdAt, t.totalTokens),
        index('idx_ai_usage_events_organization_user_created').on(t.organizationId, t.userId, t.createdAt),
        index('idx_ai_usage_events_feature_created').on(t.feature, t.createdAt),
        index('idx_ai_usage_events_organization_feature_created').on(t.organizationId, t.feature, t.createdAt),
    ],
);

export const aiUsageTraces = pgTable(
    'ai_usage_traces',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        requestId: text('request_id').notNull(),

        organizationId: text('organization_id'),
        userId: text('user_id'),

        feature: text('feature'),
        model: text('model'),

        inputText: text('input_text'),
        outputText: text('output_text'),
        inputJson: jsonb('input_json').$type<Record<string, unknown> | null>(),
        outputJson: jsonb('output_json').$type<Record<string, unknown> | null>(),

        redacted: boolean('redacted').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true })
            .notNull()
            .default(sql`now() + interval '180 days'`),
    },
    t => [
        uniqueIndex('uidx_ai_usage_traces_request_id').on(t.requestId),
        index('idx_ai_usage_traces_organization_created').on(t.organizationId, t.createdAt),
        index('idx_ai_usage_traces_organization_user_created').on(t.organizationId, t.userId, t.createdAt),
        index('idx_ai_usage_traces_expires_at').on(t.expiresAt),
    ],
);

export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type NewAiUsageEvent = typeof aiUsageEvents.$inferInsert;
export type AiUsageTrace = typeof aiUsageTraces.$inferSelect;
export type NewAiUsageTrace = typeof aiUsageTraces.$inferInsert;
