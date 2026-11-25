export const commerceGuide = `# Commerce Operations Knowledge

Deterministic commerce semantics for validating Dory Knowledge, Agent context injection, SQL analysis, and run traceability.

## Metrics

- **gmv** Successful-order gross amount before discounts and refunds. SQL: SUM(CASE WHEN orders.status <> 'payment_failed' THEN orders.gross_amount ELSE 0 END)

- **net_revenue** Successful-order net amount minus refunded amount, in USD. SQL: SUM(CASE WHEN orders.status <> 'payment_failed' THEN orders.net_amount - orders.refunded_amount ELSE 0 END)

- **order_count** Distinct checkout orders excluding payment failures. SQL: COUNT(DISTINCT CASE WHEN orders.status <> 'payment_failed' THEN orders.order_id END)

- **average_order_value** Average net amount for orders that did not fail payment. SQL: AVG(CASE WHEN orders.status <> 'payment_failed' THEN orders.net_amount END)

- **refund_rate** Refunded amount divided by net amount for orders placed in the same cohort. SQL: SUM(orders.refunded_amount) / NULLIF(SUM(CASE WHEN orders.status <> 'payment_failed' THEN orders.net_amount ELSE 0 END), 0)

- **payment_success_rate** Succeeded payment attempts divided by all payment attempts; retries remain separate attempts. SQL: AVG(CASE WHEN payments.status = 'succeeded' THEN 1.0 ELSE 0.0 END)

- **repeat_purchase_rate** Customers with at least two non-payment-failed orders divided by customers with at least one; first aggregate orders to customer grain. SQL: 1.0 * COUNT(DISTINCT CASE WHEN customer_completed_order_count >= 2 THEN customers.customer_id END) / NULLIF(COUNT(DISTINCT CASE WHEN customer_completed_order_count >= 1 THEN customers.customer_id END), 0)

- **ticket_resolution_hours** Average elapsed hours for resolved tickets. On SQLite, use JULIANDAY and exclude unresolved tickets. SQL: AVG((JULIANDAY(support_tickets.resolved_at) - JULIANDAY(support_tickets.created_at)) * 24.0)

## Relationships

- **orders_customer**  orders.customer_id → customers.customer_id

- **order_items_order**  order_items.order_id → orders.order_id

- **order_items_product**  order_items.product_id → products.product_id

- **payments_order**  payments.order_id → orders.order_id

- **support_tickets_customer**  support_tickets.customer_id → customers.customer_id

- **support_tickets_order**  support_tickets.order_id → orders.order_id

- **events_customer**  events.customer_id → customers.customer_id

## Datasets

- **customers** One row per synthetic customer, including acquisition channel, region, and segment.

- **products** One row per product SKU in six stable evaluation categories.

- **orders** One row per checkout order. Orders with status payment_failed must not contribute to revenue.

- **order_items** One row per product line in an order; use this bridge to analyze order metrics by product category.

- **payments** One row per payment attempt. A retry is a separate attempt, so do not use orders as the denominator for payment success.

- **support_tickets** One row per customer-support ticket, optionally linked to an order.

- **events** Synthetic behavioral events for acquisition and funnel exploration.`;

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
        expectedFacts: ['2026-01 net revenue = 189376.21', '2026-06 net revenue = 181273.27', 'Six monthly rows'],
        sql: "SELECT substr(ordered_at, 1, 7) AS month, ROUND(SUM(net_amount - refunded_amount), 2) AS net_revenue, COUNT(*) AS order_count, ROUND(AVG(net_amount), 2) AS average_order_value FROM orders WHERE status != 'payment_failed' AND ordered_at >= '2026-01-01' GROUP BY 1 ORDER BY 1;",
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
        expectedFacts: ['atlas_pay = 14 failed / 38 attempts', 'atlas_pay failure rate = 36.84%', 'cloud_money = 6.82%', 'swift_card = 2.33%'],
        sql: "SELECT provider, COUNT(*) AS attempts, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts, ROUND(100.0 * AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END), 2) AS failure_rate_pct FROM payments WHERE attempted_at >= '2026-05-11' AND attempted_at < '2026-05-18' GROUP BY provider ORDER BY failure_rate_pct DESC;",
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
        expectedFacts: ['Premium Wearables ranks first', 'Premium Wearables refund rate = 23.11%'],
        sql: "SELECT p.category, ROUND(SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 2) AS refunded_amount, ROUND(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 2) AS net_amount, ROUND(100.0 * SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)) / NULLIF(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 0), 2) AS refund_rate_pct FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status != 'payment_failed' GROUP BY p.category ORDER BY refund_rate_pct DESC;",
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
        expectedFacts: ['affiliate purchase rate = 95.42%', 'affiliate repeat purchase rate = 0.00%', 'Other channels repeat purchase rate > 99%'],
        sql: "WITH customer_orders AS (SELECT c.acquisition_channel, c.customer_id, COUNT(o.order_id) AS completed_orders FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status != 'payment_failed' GROUP BY 1, 2) SELECT acquisition_channel, COUNT(*) AS customers, SUM(CASE WHEN completed_orders >= 1 THEN 1 ELSE 0 END) AS purchasing_customers, ROUND(100.0 * AVG(CASE WHEN completed_orders >= 1 THEN 1.0 ELSE 0.0 END), 2) AS purchase_rate_pct, ROUND(100.0 * SUM(CASE WHEN completed_orders >= 2 THEN 1.0 ELSE 0.0 END) / NULLIF(SUM(CASE WHEN completed_orders >= 1 THEN 1.0 ELSE 0.0 END), 0), 2) AS repeat_purchase_rate_pct FROM customer_orders GROUP BY 1 ORDER BY purchase_rate_pct DESC, acquisition_channel;",
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
        expectedFacts: ['critical = 75.11 average hours', 'critical ranks worst', '28 resolved critical tickets'],
        sql: "SELECT priority, COUNT(*) AS resolved_tickets, ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24), 2) AS avg_resolution_hours FROM support_tickets WHERE resolved_at IS NOT NULL AND created_at >= '2026-06-01' AND created_at < '2026-07-01' GROUP BY priority ORDER BY avg_resolution_hours DESC;",
        knowledgeSourceFiles: ['commerce-known-incidents.md'],
    },
] as const;
