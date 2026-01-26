import 'server-only';

export const EXAMPLES = [
    {
        sql: `
            SELECT *
            FROM orders o
            WHERE o.status = 'shipped'
              AND o.id IN (SELECT order_id FROM order_items WHERE quantity > 0)
        `,
    },
];
