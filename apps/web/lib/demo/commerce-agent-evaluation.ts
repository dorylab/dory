import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export const COMMERCE_EVALUATION_CONNECTION_NAME = 'Commerce Agent Evaluation';
export const COMMERCE_EVALUATION_KNOWLEDGE_NAME = 'Commerce Operations Knowledge';
export const COMMERCE_EVALUATION_START = '2025-01-01T00:00:00.000Z';
export const COMMERCE_EVALUATION_END = '2026-06-30T23:59:59.000Z';

export const COMMERCE_EVALUATION_COUNTS = {
    customers: 1200,
    products: 48,
    orders: 8000,
    supportTickets: 1800,
    events: 36000,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_INCIDENT_START = Date.parse('2026-05-11T00:00:00.000Z');
const PAYMENT_INCIDENT_END = Date.parse('2026-05-18T00:00:00.000Z');
const SUPPORT_INCIDENT_START = Date.parse('2026-06-10T00:00:00.000Z');
const SUPPORT_INCIDENT_END = Date.parse('2026-06-25T00:00:00.000Z');
const START_MS = Date.parse(COMMERCE_EVALUATION_START);
const END_MS = Date.parse(COMMERCE_EVALUATION_END);

type SeedOptions = {
    reset?: boolean;
};

type Random = {
    next: () => number;
    integer: (min: number, max: number) => number;
    pick: <T>(values: readonly T[]) => T;
};

function createRandom(seed = 20260921): Random {
    let value = seed >>> 0;
    const next = () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
    return {
        next,
        integer: (min, max) => min + Math.floor(next() * (max - min + 1)),
        pick: values => values[Math.floor(next() * values.length)]!,
    };
}

function isoAt(timestamp: number) {
    return new Date(timestamp).toISOString();
}

function randomTimestamp(random: Random, start = START_MS, end = END_MS) {
    return start + Math.floor(random.next() * (end - start));
}

function monthKey(timestamp: number) {
    return new Date(timestamp).toISOString().slice(0, 7);
}

function createSchema(db: Database.Database) {
    db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE customers (
            customer_id INTEGER PRIMARY KEY,
            customer_name TEXT NOT NULL,
            email_hash TEXT NOT NULL UNIQUE,
            region TEXT NOT NULL,
            segment TEXT NOT NULL,
            acquisition_channel TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE products (
            product_id INTEGER PRIMARY KEY,
            sku TEXT NOT NULL UNIQUE,
            product_name TEXT NOT NULL,
            category TEXT NOT NULL,
            unit_cost REAL NOT NULL,
            list_price REAL NOT NULL,
            active INTEGER NOT NULL
        );

        CREATE TABLE orders (
            order_id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
            ordered_at TEXT NOT NULL,
            status TEXT NOT NULL,
            currency TEXT NOT NULL,
            gross_amount REAL NOT NULL,
            discount_amount REAL NOT NULL,
            net_amount REAL NOT NULL,
            refunded_amount REAL NOT NULL DEFAULT 0,
            refunded_at TEXT
        );

        CREATE TABLE order_items (
            order_item_id INTEGER PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(order_id),
            product_id INTEGER NOT NULL REFERENCES products(product_id),
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            line_amount REAL NOT NULL
        );

        CREATE TABLE payments (
            payment_id INTEGER PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(order_id),
            attempted_at TEXT NOT NULL,
            provider TEXT NOT NULL,
            payment_method TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL,
            failure_code TEXT
        );

        CREATE TABLE support_tickets (
            ticket_id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
            order_id INTEGER REFERENCES orders(order_id),
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL,
            csat_score INTEGER
        );

        CREATE TABLE events (
            event_id INTEGER PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(customer_id),
            session_id TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            event_name TEXT NOT NULL,
            channel TEXT NOT NULL,
            campaign TEXT
        );

        CREATE INDEX idx_orders_ordered_at ON orders(ordered_at);
        CREATE INDEX idx_orders_customer ON orders(customer_id);
        CREATE INDEX idx_orders_status ON orders(status);
        CREATE INDEX idx_payments_attempted_provider ON payments(attempted_at, provider);
        CREATE INDEX idx_tickets_created_priority ON support_tickets(created_at, priority);
        CREATE INDEX idx_events_occurred_channel ON events(occurred_at, channel);
    `);
}

export function generateCommerceAgentEvaluationSqlite(targetPath: string, options: SeedOptions = {}) {
    if (fs.existsSync(targetPath)) {
        if (!options.reset) return false;
        fs.rmSync(targetPath);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const db = new Database(targetPath);
    const random = createRandom();
    const customerChannels = ['organic', 'paid_search', 'affiliate', 'partner'] as const;
    const regions = ['East', 'North', 'South', 'West'] as const;
    const segments = ['consumer', 'small_business', 'enterprise'] as const;
    const categories = ['Accessories', 'Home', 'Premium Wearables', 'Software', 'Wellness', 'Travel'] as const;
    const providers = ['atlas_pay', 'cloud_money', 'swift_card'] as const;

    try {
        db.pragma('journal_mode = DELETE');
        createSchema(db);

        const customers = db.prepare(
            'INSERT INTO customers (customer_id, customer_name, email_hash, region, segment, acquisition_channel, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        const customerInsert = db.transaction(() => {
            for (let id = 1; id <= COMMERCE_EVALUATION_COUNTS.customers; id += 1) {
                const channel = id % 5 === 0 ? 'affiliate' : random.pick(['organic', 'paid_search', 'partner']);
                customers.run(
                    id,
                    `Customer ${String(id).padStart(4, '0')}`,
                    `cust_${id.toString(16).padStart(8, '0')}`,
                    random.pick(regions),
                    random.pick(segments),
                    channel,
                    isoAt(randomTimestamp(random, START_MS, Date.parse('2026-04-01T00:00:00.000Z'))),
                );
            }
        });
        customerInsert();

        const products = db.prepare('INSERT INTO products (product_id, sku, product_name, category, unit_cost, list_price, active) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const productInsert = db.transaction(() => {
            for (let id = 1; id <= COMMERCE_EVALUATION_COUNTS.products; id += 1) {
                const category = categories[(id - 1) % categories.length]!;
                const cost = 12 + (id % 9) * 7;
                products.run(
                    id,
                    `SKU-${String(id).padStart(3, '0')}`,
                    `${category} ${Math.ceil(id / categories.length)}`,
                    category,
                    cost,
                    Math.round(cost * (1.75 + (id % 4) * 0.15) * 100) / 100,
                    id % 11 === 0 ? 0 : 1,
                );
            }
        });
        productInsert();

        const orders = db.prepare(
            'INSERT INTO orders (order_id, customer_id, ordered_at, status, currency, gross_amount, discount_amount, net_amount, refunded_amount, refunded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const orderItems = db.prepare('INSERT INTO order_items (order_item_id, order_id, product_id, quantity, unit_price, line_amount) VALUES (?, ?, ?, ?, ?, ?)');
        const payments = db.prepare(
            'INSERT INTO payments (payment_id, order_id, attempted_at, provider, payment_method, amount, status, failure_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const affiliateCustomerIds = Array.from({ length: COMMERCE_EVALUATION_COUNTS.customers / 5 }, (_, index) => (index + 1) * 5);
        const nonAffiliateCustomerIds = Array.from({ length: COMMERCE_EVALUATION_COUNTS.customers }, (_, index) => index + 1).filter(id => id % 5 !== 0);
        let affiliateCustomerIndex = 0;
        let orderItemId = 1;
        let paymentId = 1;
        const orderInsert = db.transaction(() => {
            for (let orderId = 1; orderId <= COMMERCE_EVALUATION_COUNTS.orders; orderId += 1) {
                const customerId =
                    orderId % 12 === 0 && affiliateCustomerIndex < affiliateCustomerIds.length
                        ? affiliateCustomerIds[affiliateCustomerIndex++]!
                        : random.pick(nonAffiliateCustomerIds);
                const orderedAt = randomTimestamp(random);
                const itemCount = random.integer(1, 4);
                let grossAmount = 0;
                const items: Array<{ productId: number; quantity: number; unitPrice: number; lineAmount: number }> = [];
                for (let item = 0; item < itemCount; item += 1) {
                    const productId = random.integer(1, COMMERCE_EVALUATION_COUNTS.products);
                    const basePrice = 28 + (productId % 9) * 19;
                    const quantity = random.integer(1, 3);
                    const lineAmount = Math.round(basePrice * quantity * 100) / 100;
                    grossAmount += lineAmount;
                    items.push({ productId, quantity, unitPrice: basePrice, lineAmount });
                }
                grossAmount = Math.round(grossAmount * 100) / 100;
                const discountAmount = orderId % 7 === 0 ? Math.round(grossAmount * 0.1 * 100) / 100 : 0;
                const provider = random.pick(providers);
                const isPaymentIncident = provider === 'atlas_pay' && orderedAt >= PAYMENT_INCIDENT_START && orderedAt < PAYMENT_INCIDENT_END;
                const failed = isPaymentIncident ? random.next() < 0.38 : random.next() < 0.045;
                const status = failed ? 'payment_failed' : 'completed';
                const premiumWearableItem = items.some(item => (item.productId - 1) % categories.length === 2);
                const refunded = !failed && (premiumWearableItem ? random.next() < 0.28 : random.next() < 0.045);
                const refundedAmount = refunded ? Math.round((grossAmount - discountAmount) * (0.6 + random.next() * 0.4) * 100) / 100 : 0;
                const netAmount = failed ? 0 : Math.round((grossAmount - discountAmount) * 100) / 100;
                const refundedAt = refunded ? isoAt(orderedAt + random.integer(3, 18) * DAY_MS) : null;
                orders.run(orderId, customerId, isoAt(orderedAt), refunded ? 'refunded' : status, 'USD', grossAmount, discountAmount, netAmount, refundedAmount, refundedAt);
                for (const item of items) {
                    orderItems.run(orderItemId++, orderId, item.productId, item.quantity, item.unitPrice, item.lineAmount);
                }
                payments.run(
                    paymentId++,
                    orderId,
                    isoAt(orderedAt),
                    provider,
                    random.pick(['card', 'wallet', 'bank_transfer']),
                    grossAmount - discountAmount,
                    failed ? 'failed' : 'succeeded',
                    failed ? (isPaymentIncident ? 'provider_timeout' : 'card_declined') : null,
                );
                if (failed && random.next() < 0.55) {
                    payments.run(
                        paymentId++,
                        orderId,
                        isoAt(orderedAt + random.integer(5, 180) * 60 * 1000),
                        'cloud_money',
                        'card',
                        grossAmount - discountAmount,
                        'succeeded',
                        null,
                    );
                }
            }
        });
        orderInsert();

        const tickets = db.prepare(
            'INSERT INTO support_tickets (ticket_id, customer_id, order_id, created_at, resolved_at, category, priority, status, csat_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const ticketInsert = db.transaction(() => {
            for (let ticketId = 1; ticketId <= COMMERCE_EVALUATION_COUNTS.supportTickets; ticketId += 1) {
                const createdAt = randomTimestamp(random, Date.parse('2025-06-01T00:00:00.000Z'), END_MS);
                const criticalIncident = createdAt >= SUPPORT_INCIDENT_START && createdAt < SUPPORT_INCIDENT_END && ticketId % 4 === 0;
                const priority = criticalIncident ? 'critical' : random.pick(['low', 'normal', 'high']);
                const resolutionHours = criticalIncident ? random.integer(54, 96) : random.integer(2, priority === 'high' ? 30 : 60);
                const open = ticketId % 17 === 0;
                tickets.run(
                    ticketId,
                    random.integer(1, COMMERCE_EVALUATION_COUNTS.customers),
                    random.integer(1, COMMERCE_EVALUATION_COUNTS.orders),
                    isoAt(createdAt),
                    open ? null : isoAt(createdAt + resolutionHours * 60 * 60 * 1000),
                    random.pick(['delivery', 'refund', 'payment', 'product_quality', 'account']),
                    priority,
                    open ? 'open' : 'resolved',
                    open ? null : random.integer(2, 5),
                );
            }
        });
        ticketInsert();

        const events = db.prepare('INSERT INTO events (event_id, customer_id, session_id, occurred_at, event_name, channel, campaign) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const eventInsert = db.transaction(() => {
            for (let eventId = 1; eventId <= COMMERCE_EVALUATION_COUNTS.events; eventId += 1) {
                const channel = random.pick(customerChannels);
                const timestamp = randomTimestamp(random);
                const eventName =
                    channel === 'affiliate' && eventId % 5 === 0 ? 'purchase_completed' : random.pick(['page_view', 'product_view', 'add_to_cart', 'checkout_started']);
                events.run(
                    eventId,
                    random.integer(1, COMMERCE_EVALUATION_COUNTS.customers),
                    `session-${monthKey(timestamp)}-${String(eventId).padStart(6, '0')}`,
                    isoAt(timestamp),
                    eventName,
                    channel,
                    `${channel}-2026`,
                );
            }
        });
        eventInsert();
        return true;
    } finally {
        db.close();
    }
}
