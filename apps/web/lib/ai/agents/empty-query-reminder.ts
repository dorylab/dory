import { getSqlResultFromPart, record } from '@/lib/agent-runs/sql-result';

type Step = {
    toolCalls: readonly { toolCallId: string; toolName: string; input?: unknown }[];
    toolResults: readonly { toolCallId: string; toolName: string; output?: unknown }[];
};

/** Empty entity lookups describe a query, not the coverage of an entire source. */
export function emptyQueryReminder(steps: readonly Step[]): string {
    const latest = steps.at(-1);
    const empty = latest?.toolResults.find(result => {
        const query = result.toolName === 'sqlRunner' ? getSqlResultFromPart(result) : null;
        return query?.ok && query.rowCount === 0;
    });
    if (!empty) return '';
    const input = record(latest?.toolCalls.find(call => call.toolCallId === empty.toolCallId)?.input);
    const tables = new Set<string>();
    const inspected = new Set<string>();
    for (const step of steps) {
        for (const call of step.toolCalls) {
            if (call.toolName !== 'exploreSchema') continue;
            const args = record(call.input);
            if (args.connectionId !== input.connectionId || args.database !== input.database) continue;
            const output = record(step.toolResults.find(result => result.toolCallId === call.toolCallId)?.output);
            if (output.ok === false || output.control || !Object.keys(output).length) continue;
            if (args.operation === 'list_tables' && Array.isArray(output.tables)) {
                for (const table of output.tables) {
                    const name = record(table).name;
                    if (typeof name === 'string') tables.add(name);
                }
            } else if (['describe_table', 'preview_table', 'table_profile', 'get_ddl'].includes(String(args.operation)) && typeof args.table === 'string') {
                inspected.add(args.table);
            }
        }
    }
    const remaining = [...tables].filter(table => !inspected.has(table)).slice(0, 20);
    return `\nThe last SQL query returned zero rows. This establishes only that its selected table and filters did not match, not that the whole database lacks the entity or metric. If the empty result is unexpected, first check the predicates: normalize both the column and the compared literal consistently (LOWER(column) must compare to a lowercase literal), and inspect a bounded sample of actual identifiers/names when their encoding or language is unknown. Then inspect other relevant tables already listed in this same source before repeating failed predicates or declaring data unavailable. Do not infer that fact rows are absent solely from an empty lookup/join against a separate company/dimension table; verify the relevant fact table directly using its observed identifiers. Schema search matches object names/metadata, not row values. A preview is not a coverage audit.${remaining.length ? ` Listed tables not yet inspected in this connection/database: ${JSON.stringify(remaining)}. Choose the relevant regional/domain table; do not query every table blindly.` : ''}`;
}
