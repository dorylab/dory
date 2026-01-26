import 'server-only';

export const EXAMPLES = [
    {
        sql: `
            SELECT c.name
            FROM customer
            WHERE c.id = 1
        `,
        error: `Unknown identifier 'c.name'`,
    },
];
