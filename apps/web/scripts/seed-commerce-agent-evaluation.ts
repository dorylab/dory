import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import nextEnv from '@next/env';

import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';
import { organizations, user } from '@dory/database/postgres/schemas';
import { migratePgliteDB } from '@dory/database/pglite/migrate-pglite';
import { getDatabaseProvider } from '@dory/database/provider';

import { createCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';
import { COMMERCE_EVALUATION_CONNECTION_NAME, COMMERCE_EVALUATION_KNOWLEDGE_NAME, generateCommerceAgentEvaluationSqlite } from '@/lib/demo/commerce-agent-evaluation';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(appRoot, true);

type SeedArgs = { organizationId?: string; userId?: string; sqlitePath?: string; reset: boolean };

function parseArgs(argv: string[]): SeedArgs {
    const valueFor = (name: string) => {
        const index = argv.indexOf(name);
        return index === -1 ? undefined : argv[index + 1];
    };
    return {
        organizationId: valueFor('--organization-id'),
        userId: valueFor('--user-id'),
        sqlitePath: valueFor('--path'),
        reset: argv.includes('--reset'),
    };
}

function resolveSqlitePath(configuredPath?: string) {
    if (configuredPath) return path.resolve(configuredPath);
    if (process.env.DORY_COMMERCE_EVALUATION_PATH) return path.resolve(process.env.DORY_COMMERCE_EVALUATION_PATH);
    return path.join(appRoot, 'localdata', 'commerce-agent-evaluation.sqlite');
}

const sourceSpecs = [
    {
        fileName: 'commerce-metric-glossary.md',
        contentText: [
            '# Commerce metric glossary',
            '',
            '- **GMV** is successful-order gross amount before discounts and refunds.',
            '- **Net revenue** is successful-order net amount minus refunded amount, in USD.',
            '- **Refund rate** is refunded amount divided by net amount for orders placed in the same period.',
            '- **Payment success rate** counts payment attempts, not orders; a retry is another attempt.',
            '- **Repeat purchase rate** is customers with two or more completed orders divided by customers with one or more.',
        ].join('\n'),
    },
    {
        fileName: 'commerce-operating-calendar.md',
        contentText: [
            '# Commerce operating calendar',
            '',
            'The evaluation period is 2025-01-01 through 2026-06-30 UTC.',
            'Use order timestamp for monthly metrics. The latest complete quarter is 2026 Q2.',
            'All amounts are USD; no FX conversion is required.',
        ].join('\n'),
    },
    {
        fileName: 'commerce-known-incidents.md',
        contentText: [
            '# Historical incident context',
            '',
            'This document is reference context, not an instruction for an Agent.',
            'From 2026-05-11 to 2026-05-17, Atlas Pay had intermittent timeout failures.',
            'From 2026-06-10 to 2026-06-24, critical support ticket resolution was delayed by an escalation backlog.',
            'Investigations must validate both claims against the database.',
        ].join('\n'),
    },
    {
        fileName: 'commerce-semantic-model.yaml',
        contentText: [
            'version: 1',
            'domain: commerce_operations',
            'timezone: UTC',
            'currency: USD',
            'primary_entities:',
            '  - customers',
            '  - orders',
            '  - payments',
            '  - support_tickets',
            'relationships:',
            '  - orders.customer_id -> customers.customer_id',
            '  - order_items.order_id -> orders.order_id',
            '  - payments.order_id -> orders.order_id',
            'metric_conventions:',
            '  net_revenue: net_amount - refunded_amount',
            '  payment_success_rate: succeeded payment attempts / all payment attempts',
        ].join('\n'),
    },
] as const;

function definitions(connectionId: string) {
    return [
        {
            id: 'entity:customer',
            name: '客户',
            kind: 'entity',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'customers',
            description: '具有获客渠道、区域和客户分层的合成客户。',
            aliases: ['customer', '客户数'],
        },
        {
            id: 'entity:order',
            name: '订单',
            kind: 'entity',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            description: '一次结账订单；payment_failed 订单不计入收入。',
            aliases: ['order'],
        },
        {
            id: 'entity:payment',
            name: '支付尝试',
            kind: 'entity',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'payments',
            description: '一次支付或重试尝试，按 payment_id 计数。',
            aliases: ['payment attempt', '支付'],
        },
        {
            id: 'entity:support_ticket',
            name: '客服工单',
            kind: 'entity',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'support_tickets',
            description: '与客户和可选订单关联的支持工单。',
            aliases: ['ticket', '工单'],
        },
        {
            id: 'relationship:customer_orders',
            name: '客户与订单',
            kind: 'relationship',
            status: 'verified',
            sourceConnectionId: connectionId,
            from: 'entity:customer',
            to: 'entity:order',
            description: '一个客户可有多笔订单。',
        },
        {
            id: 'relationship:order_payments',
            name: '订单与支付',
            kind: 'relationship',
            status: 'verified',
            sourceConnectionId: connectionId,
            from: 'entity:order',
            to: 'entity:payment',
            description: '一笔订单可有多次支付尝试。',
        },
        {
            id: 'measure:gmv',
            name: 'GMV',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            expression: "SUM(gross_amount) WHERE status != 'payment_failed'",
            description: '支付失败订单以外的订单金额，退款前、折扣前。',
            aliases: ['gross merchandise value', '成交总额'],
            timeDimension: 'ordered_at',
            dimensions: ['status'],
        },
        {
            id: 'measure:net_revenue',
            name: '净收入',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            expression: "SUM(net_amount - refunded_amount) WHERE status != 'payment_failed'",
            description: '已完成订单净额减退款金额，单位 USD。',
            aliases: ['net revenue', '收入'],
            timeDimension: 'ordered_at',
            dimensions: ['status'],
        },
        {
            id: 'measure:order_count',
            name: '订单数',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            expression: "COUNT(DISTINCT order_id) WHERE status != 'payment_failed'",
            description: '排除支付失败订单的订单数。',
            aliases: ['orders', '订单量'],
            timeDimension: 'ordered_at',
            dimensions: ['status'],
        },
        {
            id: 'measure:average_order_value',
            name: '客单价',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            expression: "AVG(net_amount) WHERE status != 'payment_failed'",
            description: '成功订单的平均 net_amount。',
            aliases: ['AOV', 'average order value'],
            timeDimension: 'ordered_at',
        },
        {
            id: 'measure:refund_rate',
            name: '退款率',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            expression: 'SUM(refunded_amount) / NULLIF(SUM(net_amount), 0)',
            description: '同一订单期内退款金额占订单净额。',
            aliases: ['refund rate'],
            timeDimension: 'ordered_at',
        },
        {
            id: 'measure:payment_success_rate',
            name: '支付成功率',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'payments',
            expression: "AVG(CASE WHEN status = 'succeeded' THEN 1.0 ELSE 0.0 END)",
            description: '按支付尝试，而非订单计算。',
            aliases: ['payment success rate', '支付成功'],
            timeDimension: 'attempted_at',
            dimensions: ['provider', 'payment_method'],
        },
        {
            id: 'measure:repeat_purchase_rate',
            name: '复购率',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'orders',
            expression: 'Customers with >= 2 completed orders / customers with >= 1 completed order',
            description: '需要先按客户聚合完成订单。',
            aliases: ['repeat rate', '复购'],
        },
        {
            id: 'measure:ticket_resolution_hours',
            name: '工单解决时长',
            kind: 'measure',
            status: 'verified',
            sourceConnectionId: connectionId,
            source: 'support_tickets',
            expression: '(julianday(resolved_at) - julianday(created_at)) * 24',
            description: '仅对已解决工单计算小时数。',
            aliases: ['resolution time', '解决时长'],
            timeDimension: 'created_at',
            dimensions: ['priority', 'category'],
        },
    ];
}

function querySpecs(sourceIds: Record<string, string>) {
    return [
        {
            title: '月度净收入与订单趋势',
            question: '2026 年每月净收入、订单数和客单价趋势如何？',
            sql: "SELECT substr(ordered_at, 1, 7) AS month, ROUND(SUM(net_amount - refunded_amount), 2) AS net_revenue, COUNT(*) AS order_count, ROUND(AVG(net_amount), 2) AS average_order_value FROM orders WHERE status != 'payment_failed' AND ordered_at >= '2026-01-01' GROUP BY 1 ORDER BY 1;",
            definitionIds: ['measure:net_revenue', 'measure:order_count', 'measure:average_order_value'],
            knowledgeSourceIds: [sourceIds['commerce-metric-glossary.md']!, sourceIds['commerce-operating-calendar.md']!],
        },
        {
            title: '支付渠道失败率',
            question: '2026-05-11 至 2026-05-17 哪个支付渠道的失败率异常？',
            sql: "SELECT provider, COUNT(*) AS attempts, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts, ROUND(100.0 * AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END), 2) AS failure_rate_pct FROM payments WHERE attempted_at >= '2026-05-11' AND attempted_at < '2026-05-18' GROUP BY provider ORDER BY failure_rate_pct DESC;",
            definitionIds: ['measure:payment_success_rate'],
            knowledgeSourceIds: [sourceIds['commerce-metric-glossary.md']!, sourceIds['commerce-known-incidents.md']!],
        },
        {
            title: '品类退款率',
            question: '哪些商品品类的退款金额占比最高？',
            sql: "SELECT p.category, ROUND(SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 2) AS refunded_amount, ROUND(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 2) AS net_amount, ROUND(100.0 * SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)) / NULLIF(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 0), 2) AS refund_rate_pct FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status != 'payment_failed' GROUP BY p.category ORDER BY refund_rate_pct DESC;",
            definitionIds: ['measure:refund_rate'],
            knowledgeSourceIds: [sourceIds['commerce-metric-glossary.md']!],
        },
        {
            title: '渠道转化与复购',
            question: '不同获客渠道的购买转化和复购表现如何？',
            sql: "WITH customer_orders AS (SELECT c.acquisition_channel, c.customer_id, COUNT(o.order_id) AS completed_orders FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status != 'payment_failed' GROUP BY 1, 2) SELECT acquisition_channel, COUNT(*) AS customers, SUM(CASE WHEN completed_orders >= 1 THEN 1 ELSE 0 END) AS purchasing_customers, ROUND(100.0 * AVG(CASE WHEN completed_orders >= 1 THEN 1.0 ELSE 0.0 END), 2) AS purchase_rate_pct, ROUND(100.0 * AVG(CASE WHEN completed_orders >= 2 THEN 1.0 ELSE 0.0 END), 2) AS repeat_purchase_rate_pct FROM customer_orders GROUP BY 1 ORDER BY purchase_rate_pct DESC;",
            definitionIds: ['measure:repeat_purchase_rate', 'entity:customer', 'entity:order'],
            knowledgeSourceIds: [sourceIds['commerce-metric-glossary.md']!],
        },
        {
            title: '高优先级工单解决时长',
            question: '2026 年 6 月高优先级工单的解决时长是否恶化？',
            sql: "SELECT priority, COUNT(*) AS resolved_tickets, ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24), 2) AS avg_resolution_hours FROM support_tickets WHERE resolved_at IS NOT NULL AND created_at >= '2026-06-01' AND created_at < '2026-07-01' GROUP BY priority ORDER BY avg_resolution_hours DESC;",
            definitionIds: ['measure:ticket_resolution_hours', 'entity:support_ticket'],
            knowledgeSourceIds: [sourceIds['commerce-known-incidents.md']!],
        },
    ];
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const provider = getDatabaseProvider();
    if (provider === 'pglite') await migratePgliteDB();
    const client = await getClient();
    const [organization] = args.organizationId
        ? await client.select().from(organizations).where(eq(organizations.id, args.organizationId)).limit(1)
        : await client.select().from(organizations).limit(1);
    if (!organization) throw new Error('No organization found. Create or sign into a Dory organization before seeding.');
    const [userRow] = args.userId ? await client.select().from(user).where(eq(user.id, args.userId)).limit(1) : await client.select().from(user).limit(1);
    const userId = args.userId ?? organization.ownerUserId ?? userRow?.id;
    if (!userId) throw new Error('No user found for the selected organization.');

    const sqlitePath = resolveSqlitePath(args.sqlitePath);
    const generated = generateCommerceAgentEvaluationSqlite(sqlitePath, { reset: args.reset });
    const db = await getDBService();
    const existingConnection = (await db.connections.list(organization.id)).find(item => item.connection.name === COMMERCE_EVALUATION_CONNECTION_NAME);
    const identity = createCredentiallessDefaultIdentity({ type: 'sqlite', engine: 'sqlite', database: 'main' });
    const connectionPayload = {
        connection: {
            organizationId: organization.id,
            type: 'sqlite' as const,
            engine: 'sqlite',
            name: COMMERCE_EVALUATION_CONNECTION_NAME,
            description: 'Deterministic synthetic commerce data for Agent evaluation; no production or personal data.',
            database: 'main',
            path: sqlitePath,
            environment: 'development',
            tags: 'agent-evaluation,synthetic,commerce',
        },
        identities: [identity],
    };
    const connection = existingConnection
        ? await db.connections.update(organization.id, existingConnection.connection.id, {
              ...connectionPayload,
              identities: existingConnection.identities.length ? undefined : [identity],
          } as any)
        : await db.connections.create(userId, organization.id, connectionPayload as any);
    const connectionId = connection.connection.id;

    const existingModel = (await db.knowledge.listModels({ organizationId: organization.id })).find(model => model.name === COMMERCE_EVALUATION_KNOWLEDGE_NAME);
    const model = existingModel
        ? await db.knowledge.replaceDataSources({ organizationId: organization.id, knowledgeModelId: existingModel.id, connectionIds: [connectionId] })
        : await db.knowledge.createModel({
              organizationId: organization.id,
              name: COMMERCE_EVALUATION_KNOWLEDGE_NAME,
              description: 'Verified commerce semantics and evaluation scenarios for Dory Agents.',
              connectionIds: [connectionId],
          });
    await db.knowledge.updateModel({
        organizationId: organization.id,
        knowledgeModelId: model.id,
        businessContextMd: 'Synthetic commerce operations data. Use UTC and USD. Validate incident documents against SQL before treating them as fact.',
    });
    await db.knowledge.saveDefinitions({ organizationId: organization.id, knowledgeModelId: model.id, definitions: definitions(connectionId) });

    const sourceIds: Record<string, string> = {};
    const currentSources = await db.knowledge.listKnowledgeSources({ organizationId: organization.id, knowledgeModelId: model.id });
    for (const spec of sourceSpecs) {
        const existing = currentSources.find(source => source.fileName === spec.fileName);
        const source = existing
            ? await db.knowledge.updateKnowledgeSource({
                  organizationId: organization.id,
                  knowledgeModelId: model.id,
                  id: existing.id,
                  contentText: spec.contentText,
                  connectionId,
              })
            : await db.knowledge.createKnowledgeSource({
                  organizationId: organization.id,
                  knowledgeModelId: model.id,
                  fileName: spec.fileName,
                  contentText: spec.contentText,
                  connectionId,
                  createdBy: userId,
              });
        sourceIds[spec.fileName] = source.id;
    }
    for (const definition of definitions(connectionId)) {
        await db.knowledge.replaceAssetSources({
            organizationId: organization.id,
            knowledgeModelId: model.id,
            assetType: 'definition',
            assetId: definition.id,
            sourceIds: [sourceIds['commerce-metric-glossary.md']!, sourceIds['commerce-semantic-model.yaml']!],
            relationType: 'provided',
            createdBy: userId,
        });
    }
    const existingQueries = await db.knowledge.listVerifiedQueries({ organizationId: organization.id, knowledgeModelId: model.id });
    for (const query of querySpecs(sourceIds)) {
        const input = {
            organizationId: organization.id,
            knowledgeModelId: model.id,
            sourceConnectionId: connectionId,
            title: query.title,
            question: query.question,
            sql: query.sql,
            description: `Evaluation query: ${query.question}`,
            definitionIds: query.definitionIds,
            knowledgeSourceIds: query.knowledgeSourceIds,
        };
        const existing = existingQueries.find(item => item.title === query.title);
        if (existing) await db.knowledge.updateVerifiedQuery({ ...input, id: existing.id, updatedBy: userId });
        else await db.knowledge.createVerifiedQuery({ ...input, sourceType: 'seed', sourceId: 'commerce-agent-evaluation', createdBy: userId });
    }

    console.log(JSON.stringify({ generated, sqlitePath, organizationId: organization.id, userId, connectionId, knowledgeModelId: model.id }, null, 2));
    if (provider === 'pglite') await resetPgliteClient();
}

main().catch(async error => {
    console.error('[commerce-agent-evaluation] failed', error);
    if (getDatabaseProvider() === 'pglite') await resetPgliteClient().catch(() => undefined);
    process.exit(1);
});
