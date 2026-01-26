import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';

export function buildTabTitlePrompt(input: { sql: string; database?: string | null; locale?: string | null }) {
    const { sql, database, locale } = input;
    const languageLine = getPromptLanguageLine(locale);

    return [
        'You are a SQL console naming assistant. Generate a short, readable title for the SQL tab.',
        languageLine,
        'Requirements:',
        '- Max 15 characters; shorter is better.',
        '- No quotes, no newlines, output the title only.',
        '- Name based on SQL semantics, for example:',
        '  SELECT * FROM users LIMIT 100  => User list',
        "  SELECT count(*) FROM orders WHERE status = 'PAID' => Paid order count",
        '  SELECT * FROM events WHERE event_date >= today() - 7 => Events in last 7 days',
        '',
        database ? `Current database: ${database}` : '',
        '',
        'SQL to analyze:',
        sql,
    ]
        .filter(Boolean)
        .join('\n');
}
