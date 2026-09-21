import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import { COMMERCE_EVALUATION_COUNTS, generateCommerceAgentEvaluationSqlite } from '@/lib/demo/commerce-agent-evaluation';

test('commerce Agent evaluation seed is deterministic and includes the expected investigation signals', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-commerce-evaluation-'));
    const databasePath = path.join(directory, 'commerce.sqlite');
    try {
        assert.equal(generateCommerceAgentEvaluationSqlite(databasePath), true);
        assert.equal(generateCommerceAgentEvaluationSqlite(databasePath), false);
        const db = new Database(databasePath, { readonly: true });
        try {
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM customers').get() as { count: number }).count, COMMERCE_EVALUATION_COUNTS.customers);
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count, COMMERCE_EVALUATION_COUNTS.products);
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count, COMMERCE_EVALUATION_COUNTS.orders);
            assert.ok((db.prepare('SELECT COUNT(*) AS count FROM order_items').get() as { count: number }).count > COMMERCE_EVALUATION_COUNTS.orders);
            assert.ok((db.prepare('SELECT COUNT(*) AS count FROM payments').get() as { count: number }).count >= COMMERCE_EVALUATION_COUNTS.orders);
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM support_tickets').get() as { count: number }).count, COMMERCE_EVALUATION_COUNTS.supportTickets);
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number }).count, COMMERCE_EVALUATION_COUNTS.events);
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM orders WHERE customer_id NOT IN (SELECT customer_id FROM customers)').get() as { count: number }).count, 0);
            assert.equal((db.prepare('SELECT COUNT(*) AS count FROM payments WHERE order_id NOT IN (SELECT order_id FROM orders)').get() as { count: number }).count, 0);
            assert.equal(
                (db.prepare('SELECT COUNT(*) AS count FROM support_tickets WHERE customer_id NOT IN (SELECT customer_id FROM customers)').get() as { count: number }).count,
                0,
            );
            assert.equal(
                (
                    db.prepare('SELECT COUNT(*) AS count FROM events WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT customer_id FROM customers)').get() as {
                        count: number;
                    }
                ).count,
                0,
            );

            const paymentIncident = db
                .prepare(
                    "SELECT provider, AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END) AS failure_rate FROM payments WHERE attempted_at >= '2026-05-11' AND attempted_at < '2026-05-18' GROUP BY provider ORDER BY failure_rate DESC LIMIT 1",
                )
                .get() as { provider: string; failure_rate: number };
            assert.equal(paymentIncident.provider, 'atlas_pay');
            assert.ok(paymentIncident.failure_rate > 0.25);

            const refundLeader = db
                .prepare(
                    "SELECT p.category, SUM(o.refunded_amount * oi.line_amount / NULLIF(o.gross_amount, 0)) / NULLIF(SUM(o.net_amount * oi.line_amount / NULLIF(o.gross_amount, 0)), 0) AS refund_rate FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status != 'payment_failed' GROUP BY p.category ORDER BY refund_rate DESC LIMIT 1",
                )
                .get() as { category: string; refund_rate: number };
            assert.equal(refundLeader.category, 'Premium Wearables');
            assert.ok(refundLeader.refund_rate > 0.18);

            const affiliate = db
                .prepare(
                    "WITH customer_orders AS (SELECT c.acquisition_channel, c.customer_id, COUNT(o.order_id) AS completed_orders FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status != 'payment_failed' GROUP BY 1, 2) SELECT AVG(CASE WHEN completed_orders >= 1 THEN 1.0 ELSE 0.0 END) AS purchase_rate, AVG(CASE WHEN completed_orders >= 2 THEN 1.0 ELSE 0.0 END) AS repeat_rate FROM customer_orders WHERE acquisition_channel = 'affiliate'",
                )
                .get() as { purchase_rate: number; repeat_rate: number };
            assert.ok(affiliate.purchase_rate > 0.9);
            assert.ok(affiliate.repeat_rate < 0.05);

            const ticketIncident = db
                .prepare(
                    "SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS resolution_hours FROM support_tickets WHERE priority = 'critical' AND resolved_at IS NOT NULL AND created_at >= '2026-06-10' AND created_at < '2026-06-25'",
                )
                .get() as { resolution_hours: number };
            assert.ok(ticketIncident.resolution_hours > 50);
        } finally {
            db.close();
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
