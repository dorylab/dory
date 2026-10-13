import type {
    KnowledgeDefinition,
    OssieAiContext,
    OssieCustomExtension,
    OssieDataset,
    OssieDocumentV011,
    OssieField,
    OssieMetric,
    OssieRelationship,
} from '@dory/database/postgres/schemas';

import { COMMERCE_EVALUATION_KNOWLEDGE_NAME } from './commerce-agent-evaluation';

type DefinitionKind = KnowledgeDefinition['kind'];

function doryExtension(connectionId: string, id: string, kind: DefinitionKind, extra: Record<string, unknown> = {}): OssieCustomExtension[] {
    return [
        {
            vendor_name: 'COMMON',
            data: JSON.stringify({
                dory: {
                    id,
                    kind,
                    status: 'verified',
                    sourceConnectionId: connectionId,
                    ...extra,
                },
            }),
        },
    ];
}

function field(
    connectionId: string,
    datasetName: string,
    name: string,
    options: {
        description?: string;
        synonyms?: string[];
        examples?: string[];
        isTime?: boolean;
    } = {},
): OssieField {
    const aiContext: Exclude<OssieAiContext, string> = {};
    if (options.synonyms?.length) aiContext.synonyms = options.synonyms;
    if (options.examples?.length) aiContext.examples = options.examples;
    return {
        name,
        expression: { dialects: [{ dialect: 'ANSI_SQL', expression: `${datasetName}.${name}` }] },
        ...(options.description ? { description: options.description } : {}),
        ...(options.isTime ? { dimension: { is_time: true } } : {}),
        ...(Object.keys(aiContext).length ? { ai_context: aiContext } : {}),
        custom_extensions: doryExtension(connectionId, `dimension:${datasetName}:${name}`, 'dimension'),
    };
}

function dataset(
    connectionId: string,
    name: string,
    primaryKey: string,
    fields: Array<[string, Parameters<typeof field>[3]?]>,
    description: string,
    aiContext: OssieAiContext,
): OssieDataset {
    return {
        name,
        source: name,
        primary_key: [primaryKey],
        description,
        ai_context: aiContext,
        fields: fields.map(([fieldName, options]) => field(connectionId, name, fieldName, options)),
        custom_extensions: doryExtension(connectionId, `entity:${name}`, 'entity'),
    };
}

function metric(
    connectionId: string,
    name: string,
    expression: string,
    description: string,
    aiContext: OssieAiContext,
    options: { dimensions?: string[]; filters?: string[] } = {},
): OssieMetric {
    return {
        name,
        expression: { dialects: [{ dialect: 'ANSI_SQL', expression }] },
        description,
        ai_context: aiContext,
        custom_extensions: doryExtension(connectionId, `metric:${name}`, 'metric', options),
    };
}

function relationship(connectionId: string, name: string, from: string, to: string, fromColumn: string, toColumn: string, instructions: string): OssieRelationship {
    return {
        name,
        from,
        to,
        from_columns: [fromColumn],
        to_columns: [toColumn],
        ai_context: { instructions },
        custom_extensions: doryExtension(connectionId, `relationship:${name}`, 'relationship'),
    };
}

export function buildCommerceEvaluationOssieDocument(connectionId: string): OssieDocumentV011 {
    return {
        version: '0.1.1',
        semantic_model: [
            {
                name: COMMERCE_EVALUATION_KNOWLEDGE_NAME,
                description: 'Deterministic commerce semantics for validating Dory Knowledge, Agent context injection, SQL analysis, and run traceability.',
                ai_context: {
                    instructions:
                        'Use UTC for all dates and USD for all monetary values. Exclude payment_failed orders from revenue and order-volume metrics. Payment success rate is calculated over payment attempts, not orders. Refund rate uses the order cohort and is refunded_amount divided by net_amount. Treat incident notes as hypotheses and validate them with SQL before presenting them as facts.',
                    synonyms: ['commerce operations', '电商经营', '交易运营', '销售分析'],
                    examples: [
                        '2026 年每月净收入、订单数和客单价趋势如何？',
                        '2026-05-11 至 2026-05-17 哪个支付渠道的失败率异常？',
                        '哪些商品品类的退款金额占比最高？',
                        '不同获客渠道的购买转化和复购表现如何？',
                        '2026 年 6 月高优先级工单的解决时长是否恶化？',
                    ],
                },
                datasets: [
                    dataset(
                        connectionId,
                        'customers',
                        'customer_id',
                        [
                            ['customer_id', { description: 'Stable customer identifier.', synonyms: ['客户 ID'] }],
                            ['customer_name', { description: 'Synthetic display name; not real personal data.' }],
                            ['email_hash', { description: 'Synthetic non-reversible customer token.' }],
                            ['region', { synonyms: ['地区', '区域'] }],
                            ['segment', { synonyms: ['客户分层', '客群'] }],
                            ['acquisition_channel', { synonyms: ['获客渠道', '渠道'] }],
                            ['created_at', { description: 'Customer signup timestamp in UTC.', synonyms: ['注册时间'], isTime: true }],
                        ],
                        'One row per synthetic customer, including acquisition channel, region, and segment.',
                        { synonyms: ['customer', '用户', '客户'] },
                    ),
                    dataset(
                        connectionId,
                        'products',
                        'product_id',
                        [
                            ['product_id', { synonyms: ['商品 ID'] }],
                            ['sku'],
                            ['product_name', { synonyms: ['商品名'] }],
                            ['category', { synonyms: ['品类', '商品类别'] }],
                            ['unit_cost', { synonyms: ['单位成本'] }],
                            ['list_price', { synonyms: ['标价'] }],
                            ['active', { description: '1 when the product is currently active, otherwise 0.' }],
                        ],
                        'One row per product SKU in six stable evaluation categories.',
                        { synonyms: ['product', '商品', 'SKU'], examples: ['哪些商品品类的退款金额占比最高？'] },
                    ),
                    dataset(
                        connectionId,
                        'orders',
                        'order_id',
                        [
                            ['order_id', { synonyms: ['订单 ID'] }],
                            ['customer_id'],
                            ['ordered_at', { description: 'Order creation timestamp in UTC.', synonyms: ['下单时间'], isTime: true }],
                            ['status', { description: 'completed, refunded, or payment_failed.', synonyms: ['订单状态'] }],
                            ['currency'],
                            ['gross_amount', { description: 'Amount before discount and refund.', synonyms: ['GMV 金额', '订单原价'] }],
                            ['discount_amount', { synonyms: ['优惠金额'] }],
                            ['net_amount', { description: 'Gross amount minus discount; zero for payment failures.', synonyms: ['订单净额'] }],
                            ['refunded_amount', { synonyms: ['退款金额'] }],
                            ['refunded_at', { synonyms: ['退款时间'], isTime: true }],
                        ],
                        'One row per checkout order. Orders with status payment_failed must not contribute to revenue.',
                        { synonyms: ['order', '订单', '交易'] },
                    ),
                    dataset(
                        connectionId,
                        'order_items',
                        'order_item_id',
                        [
                            ['order_item_id'],
                            ['order_id'],
                            ['product_id'],
                            ['quantity', { synonyms: ['数量'] }],
                            ['unit_price', { synonyms: ['成交单价'] }],
                            ['line_amount', { synonyms: ['明细金额'] }],
                        ],
                        'One row per product line in an order; use this bridge to analyze order metrics by product category.',
                        { synonyms: ['order line', '订单明细'], examples: ['哪些商品品类的退款金额占比最高？'] },
                    ),
                    dataset(
                        connectionId,
                        'payments',
                        'payment_id',
                        [
                            ['payment_id'],
                            ['order_id'],
                            ['attempted_at', { description: 'Payment attempt timestamp in UTC.', synonyms: ['支付尝试时间'], isTime: true }],
                            ['provider', { synonyms: ['支付渠道', '支付服务商'] }],
                            ['payment_method', { synonyms: ['支付方式'] }],
                            ['amount', { synonyms: ['支付金额'] }],
                            ['status', { description: 'succeeded or failed.', synonyms: ['支付状态'] }],
                            ['failure_code', { synonyms: ['失败码', '错误码'] }],
                        ],
                        'One row per payment attempt. A retry is a separate attempt, so do not use orders as the denominator for payment success.',
                        { synonyms: ['payment attempt', '支付', '支付尝试'] },
                    ),
                    dataset(
                        connectionId,
                        'support_tickets',
                        'ticket_id',
                        [
                            ['ticket_id', { synonyms: ['工单 ID'] }],
                            ['customer_id'],
                            ['order_id'],
                            ['created_at', { synonyms: ['建单时间'], isTime: true }],
                            ['resolved_at', { synonyms: ['解决时间'], isTime: true }],
                            ['category', { synonyms: ['工单类型'] }],
                            ['priority', { synonyms: ['优先级'] }],
                            ['status', { synonyms: ['工单状态'] }],
                            ['csat_score', { synonyms: ['满意度', 'CSAT'] }],
                        ],
                        'One row per customer-support ticket, optionally linked to an order.',
                        { synonyms: ['ticket', '客服工单', '工单'] },
                    ),
                    dataset(
                        connectionId,
                        'events',
                        'event_id',
                        [
                            ['event_id'],
                            ['customer_id'],
                            ['session_id', { synonyms: ['会话 ID'] }],
                            ['occurred_at', { synonyms: ['事件时间'], isTime: true }],
                            ['event_name', { synonyms: ['事件名', '行为'] }],
                            ['channel', { synonyms: ['访问渠道'] }],
                            ['campaign', { synonyms: ['营销活动'] }],
                        ],
                        'Synthetic behavioral events for acquisition and funnel exploration.',
                        { synonyms: ['event', '埋点事件', '行为事件'] },
                    ),
                ],
                metrics: [
                    metric(
                        connectionId,
                        'gmv',
                        "SUM(CASE WHEN orders.status <> 'payment_failed' THEN orders.gross_amount ELSE 0 END)",
                        'Successful-order gross amount before discounts and refunds.',
                        { synonyms: ['gross merchandise value', '成交总额', '交易总额'], examples: ['按月查看 GMV。'] },
                        { dimensions: ['ordered_at', 'status'] },
                    ),
                    metric(
                        connectionId,
                        'net_revenue',
                        "SUM(CASE WHEN orders.status <> 'payment_failed' THEN orders.net_amount - orders.refunded_amount ELSE 0 END)",
                        'Successful-order net amount minus refunded amount, in USD.',
                        { synonyms: ['net revenue', '净收入', '收入'], examples: ['2026 年每月净收入、订单数和客单价趋势如何？'] },
                        { dimensions: ['ordered_at', 'status'] },
                    ),
                    metric(
                        connectionId,
                        'order_count',
                        "COUNT(DISTINCT CASE WHEN orders.status <> 'payment_failed' THEN orders.order_id END)",
                        'Distinct checkout orders excluding payment failures.',
                        { synonyms: ['orders', '订单数', '订单量'], examples: ['2026 年每月净收入、订单数和客单价趋势如何？'] },
                        { dimensions: ['ordered_at', 'status'] },
                    ),
                    metric(
                        connectionId,
                        'average_order_value',
                        "AVG(CASE WHEN orders.status <> 'payment_failed' THEN orders.net_amount END)",
                        'Average net amount for orders that did not fail payment.',
                        { synonyms: ['AOV', 'average order value', '客单价'], examples: ['2026 年每月净收入、订单数和客单价趋势如何？'] },
                        { dimensions: ['ordered_at'] },
                    ),
                    metric(
                        connectionId,
                        'refund_rate',
                        "SUM(orders.refunded_amount) / NULLIF(SUM(CASE WHEN orders.status <> 'payment_failed' THEN orders.net_amount ELSE 0 END), 0)",
                        'Refunded amount divided by net amount for orders placed in the same cohort.',
                        { synonyms: ['refund rate', '退款率', '退款金额占比'], examples: ['哪些商品品类的退款金额占比最高？'] },
                        { dimensions: ['ordered_at', 'category'] },
                    ),
                    metric(
                        connectionId,
                        'payment_success_rate',
                        "AVG(CASE WHEN payments.status = 'succeeded' THEN 1.0 ELSE 0.0 END)",
                        'Succeeded payment attempts divided by all payment attempts; retries remain separate attempts.',
                        {
                            synonyms: ['payment success rate', '支付成功率', '支付失败率'],
                            examples: ['2026-05-11 至 2026-05-17 哪个支付渠道的失败率异常？'],
                        },
                        { dimensions: ['attempted_at', 'provider', 'payment_method'] },
                    ),
                    metric(
                        connectionId,
                        'repeat_purchase_rate',
                        '1.0 * COUNT(DISTINCT CASE WHEN customer_completed_order_count >= 2 THEN customers.customer_id END) / NULLIF(COUNT(DISTINCT CASE WHEN customer_completed_order_count >= 1 THEN customers.customer_id END), 0)',
                        'Customers with at least two non-payment-failed orders divided by customers with at least one; first aggregate orders to customer grain.',
                        {
                            instructions: 'Build a customer-level completed-order count before calculating this metric.',
                            synonyms: ['repeat purchase rate', 'repeat rate', '复购率', '复购'],
                            examples: ['不同获客渠道的购买转化和复购表现如何？'],
                        },
                        { dimensions: ['acquisition_channel'] },
                    ),
                    metric(
                        connectionId,
                        'ticket_resolution_hours',
                        'AVG((JULIANDAY(support_tickets.resolved_at) - JULIANDAY(support_tickets.created_at)) * 24.0)',
                        'Average elapsed hours for resolved tickets. On SQLite, use JULIANDAY and exclude unresolved tickets.',
                        { synonyms: ['resolution time', '解决时长', '工单解决时长'], examples: ['2026 年 6 月高优先级工单的解决时长是否恶化？'] },
                        { dimensions: ['created_at', 'priority', 'category'], filters: ['resolved_at IS NOT NULL'] },
                    ),
                ],
                relationships: [
                    relationship(connectionId, 'orders_customer', 'orders', 'customers', 'customer_id', 'customer_id', 'Many orders belong to one customer.'),
                    relationship(connectionId, 'order_items_order', 'order_items', 'orders', 'order_id', 'order_id', 'Many order lines belong to one order.'),
                    relationship(connectionId, 'order_items_product', 'order_items', 'products', 'product_id', 'product_id', 'Many order lines reference one product.'),
                    relationship(
                        connectionId,
                        'payments_order',
                        'payments',
                        'orders',
                        'order_id',
                        'order_id',
                        'Payment attempts belong to an order; retries may create multiple attempts.',
                    ),
                    relationship(connectionId, 'support_tickets_customer', 'support_tickets', 'customers', 'customer_id', 'customer_id', 'Support tickets belong to a customer.'),
                    relationship(
                        connectionId,
                        'support_tickets_order',
                        'support_tickets',
                        'orders',
                        'order_id',
                        'order_id',
                        'A support ticket may reference an order; order_id can be null.',
                    ),
                    relationship(connectionId, 'events_customer', 'events', 'customers', 'customer_id', 'customer_id', 'Anonymous events may have a null customer_id.'),
                ],
            },
        ],
    };
}

export const COMMERCE_EVALUATION_SCENARIOS = [
    {
        id: 'monthly_revenue',
        expectedRows: [
            { month: '2026-01', net_revenue: 189376.21, order_count: 451, average_order_value: 487.22 },
            { month: '2026-02', net_revenue: 154578.92, order_count: 343, average_order_value: 491.51 },
            { month: '2026-03', net_revenue: 199414.66, order_count: 455, average_order_value: 483.25 },
            { month: '2026-04', net_revenue: 188582.22, order_count: 420, average_order_value: 496.53 },
            { month: '2026-05', net_revenue: 182990.9, order_count: 429, average_order_value: 477.0 },
            { month: '2026-06', net_revenue: 181273.27, order_count: 421, average_order_value: 493.15 },
        ],
        title: '月度净收入与订单趋势',
        question: '2026 年每月净收入、订单数和客单价趋势如何？',
        expectedSemanticIds: ['metric:net_revenue', 'metric:order_count', 'metric:average_order_value'],
        expectedFacts: ['2026-01 net revenue = 189376.21', '2026-06 net revenue = 181273.27', 'Six monthly rows'],
        sql: "SELECT substr(ordered_at, 1, 7) AS month, ROUND(SUM(net_amount - refunded_amount), 2) AS net_revenue, COUNT(*) AS order_count, ROUND(AVG(net_amount), 2) AS average_order_value FROM orders WHERE status != 'payment_failed' AND ordered_at >= '2026-01-01' GROUP BY 1 ORDER BY 1;",
        definitionIds: ['metric:net_revenue', 'metric:order_count', 'metric:average_order_value'],
        knowledgeSourceFiles: ['commerce-metric-glossary.md', 'commerce-operating-calendar.md'],
    },
    {
        id: 'payment_incident',
        expectedRows: [
            { provider: 'atlas_pay', attempts: 38, failed_attempts: 14, failure_rate_pct: 36.84 },
            { provider: 'cloud_money', attempts: 44, failed_attempts: 3, failure_rate_pct: 6.82 },
            { provider: 'swift_card', attempts: 43, failed_attempts: 1, failure_rate_pct: 2.33 },
        ],
        title: '支付渠道失败率',
        question: '2026-05-11 至 2026-05-17 哪个支付渠道的失败率异常？',
        expectedSemanticIds: ['metric:payment_success_rate', 'relationship:payments_order'],
        expectedFacts: ['atlas_pay = 14 failed / 38 attempts', 'atlas_pay failure rate = 36.84%', 'cloud_money = 6.82%', 'swift_card = 2.33%'],
        sql: "SELECT provider, COUNT(*) AS attempts, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts, ROUND(100.0 * AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END), 2) AS failure_rate_pct FROM payments WHERE attempted_at >= '2026-05-11' AND attempted_at < '2026-05-18' GROUP BY provider ORDER BY failure_rate_pct DESC;",
        definitionIds: ['metric:payment_success_rate', 'relationship:payments_order'],
        knowledgeSourceFiles: ['commerce-metric-glossary.md', 'commerce-known-incidents.md'],
    },
    {
        id: 'category_refunds',
        expectedRows: [
            { category: 'Premium Wearables', refunded_amount: 111523.79, net_amount: 482650.7, refund_rate_pct: 23.11 },
            { category: 'Home', refunded_amount: 68733.41, net_amount: 749188.5, refund_rate_pct: 9.17 },
            { category: 'Accessories', refunded_amount: 59253.54, net_amount: 657645.8, refund_rate_pct: 9.01 },
            { category: 'Travel', refunded_amount: 52528.62, net_amount: 590542.8, refund_rate_pct: 8.89 },
            { category: 'Wellness', refunded_amount: 63242.94, net_amount: 728406.9, refund_rate_pct: 8.68 },
            { category: 'Software', refunded_amount: 48723.35, net_amount: 584815.7, refund_rate_pct: 8.33 },
        ],
        title: '品类退款率',
        question: '哪些商品品类的退款金额占比最高？',
        expectedSemanticIds: ['metric:refund_rate', 'relationship:order_items_order', 'relationship:order_items_product'],
        expectedFacts: ['Premium Wearables ranks first', 'Premium Wearables refund rate = 23.11%'],
        sql: "SELECT p.category, ROUND(SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 2) AS refunded_amount, ROUND(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 2) AS net_amount, ROUND(100.0 * SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)) / NULLIF(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 0), 2) AS refund_rate_pct FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status != 'payment_failed' GROUP BY p.category ORDER BY refund_rate_pct DESC;",
        definitionIds: ['metric:refund_rate', 'relationship:order_items_order', 'relationship:order_items_product'],
        knowledgeSourceFiles: ['commerce-metric-glossary.md'],
    },
    {
        id: 'channel_retention',
        expectedRows: [
            { acquisition_channel: 'organic', customers: 316, purchasing_customers: 316, purchase_rate_pct: 100.0, repeat_purchase_rate_pct: 100.0 },
            { acquisition_channel: 'paid_search', customers: 325, purchasing_customers: 325, purchase_rate_pct: 100.0, repeat_purchase_rate_pct: 99.38 },
            { acquisition_channel: 'partner', customers: 319, purchasing_customers: 319, purchase_rate_pct: 100.0, repeat_purchase_rate_pct: 99.69 },
            { acquisition_channel: 'affiliate', customers: 240, purchasing_customers: 229, purchase_rate_pct: 95.42, repeat_purchase_rate_pct: 0.0 },
        ],
        title: '渠道转化与复购',
        question: '不同获客渠道的购买转化和复购表现如何？',
        expectedSemanticIds: ['metric:repeat_purchase_rate', 'relationship:orders_customer'],
        expectedFacts: ['affiliate purchase rate = 95.42%', 'affiliate repeat purchase rate = 0.00%', 'Other channels repeat purchase rate > 99%'],
        sql: "WITH customer_orders AS (SELECT c.acquisition_channel, c.customer_id, COUNT(o.order_id) AS completed_orders FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status != 'payment_failed' GROUP BY 1, 2) SELECT acquisition_channel, COUNT(*) AS customers, SUM(CASE WHEN completed_orders >= 1 THEN 1 ELSE 0 END) AS purchasing_customers, ROUND(100.0 * AVG(CASE WHEN completed_orders >= 1 THEN 1.0 ELSE 0.0 END), 2) AS purchase_rate_pct, ROUND(100.0 * SUM(CASE WHEN completed_orders >= 2 THEN 1.0 ELSE 0.0 END) / NULLIF(SUM(CASE WHEN completed_orders >= 1 THEN 1.0 ELSE 0.0 END), 0), 2) AS repeat_purchase_rate_pct FROM customer_orders GROUP BY 1 ORDER BY purchase_rate_pct DESC, acquisition_channel;",
        definitionIds: ['metric:repeat_purchase_rate', 'relationship:orders_customer', 'entity:customers', 'entity:orders'],
        knowledgeSourceFiles: ['commerce-metric-glossary.md'],
    },
    {
        id: 'support_backlog',
        expectedRows: [
            { priority: 'critical', resolved_tickets: 28, avg_resolution_hours: 75.11 },
            { priority: 'low', resolved_tickets: 34, avg_resolution_hours: 34.88 },
            { priority: 'normal', resolved_tickets: 51, avg_resolution_hours: 28.96 },
            { priority: 'high', resolved_tickets: 29, avg_resolution_hours: 17.97 },
        ],
        title: '高优先级工单解决时长',
        question: '2026 年 6 月高优先级工单的解决时长是否恶化？',
        expectedSemanticIds: ['metric:ticket_resolution_hours', 'entity:support_tickets'],
        expectedFacts: ['critical = 75.11 average hours', 'critical ranks worst', '28 resolved critical tickets'],
        sql: "SELECT priority, COUNT(*) AS resolved_tickets, ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24), 2) AS avg_resolution_hours FROM support_tickets WHERE resolved_at IS NOT NULL AND created_at >= '2026-06-01' AND created_at < '2026-07-01' GROUP BY priority ORDER BY avg_resolution_hours DESC;",
        definitionIds: ['metric:ticket_resolution_hours', 'entity:support_tickets'],
        knowledgeSourceFiles: ['commerce-known-incidents.md'],
    },
] as const;
