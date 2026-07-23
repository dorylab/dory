import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export type SchemaCompareFixtureSide = {
    name: string;
    environment: 'prod' | 'staging';
    fileName: string;
    ddl: string;
};

export type SchemaCompareFixtureScenario = {
    id: string;
    title: string;
    expected: string;
    current: SchemaCompareFixtureSide;
    desired: SchemaCompareFixtureSide;
};

export type GeneratedSchemaCompareFixture = SchemaCompareFixtureScenario & {
    currentPath: string;
    desiredPath: string;
};

const NO_CHANGES_DDL = `
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email VARCHAR(160) NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX ux_users_email ON users(email);
    CREATE INDEX idx_orders_user_id ON orders(user_id);

    CREATE VIEW user_order_totals AS
        SELECT users.id AS user_id, users.email, SUM(orders.total) AS total
        FROM users
        LEFT JOIN orders ON orders.user_id = users.id
        GROUP BY users.id, users.email;
`;

const SAFE_CURRENT_DDL = `
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX ux_users_email ON users(email);

    CREATE VIEW user_order_totals AS
        SELECT users.id AS user_id, SUM(orders.total) AS total
        FROM users LEFT JOIN orders ON orders.user_id = users.id
        GROUP BY users.id;
`;

const SAFE_DESIRED_DDL = `
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        display_name TEXT,
        timezone TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        order_id INTEGER,
        provider TEXT,
        received_at TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE UNIQUE INDEX ux_users_email ON users(email);
    CREATE INDEX idx_orders_created_at ON orders(created_at);

    CREATE VIEW user_order_totals AS
        SELECT users.id AS user_id, SUM(orders.total) AS total
        FROM users
        LEFT JOIN orders ON orders.user_id = users.id
        GROUP BY users.id;
`;

const REVIEW_CURRENT_DDL = `
    CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        sku TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE INDEX idx_products_sku ON products(sku);
    CREATE INDEX idx_products_price ON products(price);

    CREATE VIEW catalog AS
        SELECT id, sku, price
        FROM products;
`;

const REVIEW_DESIRED_DDL = `
    CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        sku TEXT NOT NULL,
        price NUMERIC(12, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        availability TEXT NOT NULL DEFAULT 'in_stock'
    );

    CREATE INDEX idx_catalog_sku ON products(sku);
    CREATE INDEX idx_products_status ON products(status);

    CREATE VIEW catalog AS
        SELECT id, sku, price, status, availability
        FROM products;
`;

const UNSAFE_CURRENT_DDL = `
    CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL
    );

    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        account_id INTEGER NOT NULL,
        external_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL,
        event TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX idx_orders_created_at ON orders(created_at);

    CREATE VIEW account_order_totals AS
        SELECT account_id, COUNT(*) AS order_count
        FROM orders
        GROUP BY account_id;
`;

const UNSAFE_DESIRED_DDL = `
    CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        display_name TEXT
    );

    CREATE TABLE orders (
        id INTEGER,
        account_id INTEGER,
        external_id TEXT NOT NULL,
        region TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, account_id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE VIEW account_order_totals AS
        SELECT account_id, COUNT(*) AS order_count, MAX(created_at) AS last_order_at
        FROM orders
        GROUP BY account_id;
`;

function side(scenario: string, direction: 'Current' | 'Desired', fileName: string, environment: SchemaCompareFixtureSide['environment'], ddl: string): SchemaCompareFixtureSide {
    return {
        name: `Compare Lab · ${scenario} · ${direction}`,
        environment,
        fileName,
        ddl,
    };
}

export const SCHEMA_COMPARE_FIXTURE_SCENARIOS: SchemaCompareFixtureScenario[] = [
    {
        id: '01-no-changes',
        title: '01 No changes',
        expected: '0 changes. SQLite catalog coverage may keep readiness unknown.',
        current: side('01 No changes', 'Current', '01-no-changes-current.sqlite', 'prod', NO_CHANGES_DDL),
        desired: side('01 No changes', 'Desired', '01-no-changes-desired.sqlite', 'staging', NO_CHANGES_DDL),
    },
    {
        id: '02-safe-additions',
        title: '02 Safe additions',
        expected: 'Low-risk table, nullable column, index additions, and VARCHAR widening; no breaking changes.',
        current: side('02 Safe additions', 'Current', '02-safe-additions-current.sqlite', 'prod', SAFE_CURRENT_DDL),
        desired: side('02 Safe additions', 'Desired', '02-safe-additions-desired.sqlite', 'staging', SAFE_DESIRED_DDL),
    },
    {
        id: '03-review-changes',
        title: '03 Review changes',
        expected: 'Medium-risk default/view/index changes, a non-null column with a default, and an index semantic rename.',
        current: side('03 Review changes', 'Current', '03-review-changes-current.sqlite', 'prod', REVIEW_CURRENT_DDL),
        desired: side('03 Review changes', 'Desired', '03-review-changes-desired.sqlite', 'staging', REVIEW_DESIRED_DDL),
    },
    {
        id: '04-unsafe-breaking',
        title: '04 Unsafe breaking',
        expected: 'Unsafe: removed table/columns/key behavior plus a required column without a default.',
        current: side('04 Unsafe breaking', 'Current', '04-unsafe-breaking-current.sqlite', 'prod', UNSAFE_CURRENT_DDL),
        desired: side('04 Unsafe breaking', 'Desired', '04-unsafe-breaking-desired.sqlite', 'staging', UNSAFE_DESIRED_DDL),
    },
];

function createFixtureDatabase(targetPath: string, ddl: string) {
    fs.rmSync(targetPath, { force: true });
    const db = new Database(targetPath);
    try {
        db.pragma('journal_mode = DELETE');
        db.pragma('foreign_keys = ON');
        db.exec(ddl);
    } finally {
        db.close();
    }
}

export function generateSchemaCompareFixtures(targetDirectory: string): GeneratedSchemaCompareFixture[] {
    const directory = path.resolve(targetDirectory);
    fs.mkdirSync(directory, { recursive: true });

    return SCHEMA_COMPARE_FIXTURE_SCENARIOS.map(scenario => {
        const currentPath = path.join(directory, scenario.current.fileName);
        const desiredPath = path.join(directory, scenario.desired.fileName);
        createFixtureDatabase(currentPath, scenario.current.ddl);
        createFixtureDatabase(desiredPath, scenario.desired.ddl);
        return {
            ...scenario,
            currentPath,
            desiredPath,
        };
    });
}
