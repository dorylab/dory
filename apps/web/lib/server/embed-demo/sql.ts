import type { Locale } from '@dory/i18n/routing';

export type HackerNewsSqlDemo = {
    tabName: string;
    nextTabName: string;
    nextActionLabel: string;
    initialSql: string;
    nextSql: string;
};

const marker = '-- DORY_HACKER_NEWS_DEMO';

function labels(locale: Locale) {
    const values: Record<Locale, { task: string; score: string; discussion: string; domain: string; tab: string; nextTab: string; next: string }> = {
        en: {
            task: 'Three Hacker News trends from the last 30 days',
            score: 'Top 10 stories have a score premium',
            discussion: 'Top 50 stories attract more discussion',
            domain: 'The leading domain has a measurable share',
            tab: 'Three HN trends',
            nextTab: 'Next query · domains',
            next: 'Open next query',
        },
        zh: {
            task: '找出最近 30 天 Hacker News 数据中的三个趋势',
            score: 'Top 10 文章的分数明显更高',
            discussion: 'Top 50 文章吸引更多讨论',
            domain: '头部域名占据可量化的份额',
            tab: '三个 HN 趋势',
            nextTab: '下一条查询 · 域名',
            next: '打开下一条查询',
        },
        ja: {
            task: '直近30日間の Hacker News データから3つの傾向を見つける',
            score: 'Top 10 の記事はスコアが高い',
            discussion: 'Top 50 の記事はより多くの議論を集める',
            domain: '上位ドメインには測定可能なシェアがある',
            tab: 'HN の3つの傾向',
            nextTab: '次のクエリ · ドメイン',
            next: '次のクエリを開く',
        },
        es: {
            task: 'Tres tendencias de Hacker News de los últimos 30 días',
            score: 'Las historias del Top 10 tienen más puntuación',
            discussion: 'Las historias del Top 50 generan más conversación',
            domain: 'El dominio líder tiene una cuota medible',
            tab: 'Tres tendencias de HN',
            nextTab: 'Siguiente consulta · dominios',
            next: 'Abrir siguiente consulta',
        },
    };
    return values[locale];
}

function sqlString(value: string) {
    return value.replaceAll("'", "''");
}

export function getHackerNewsSqlDemo(locale: Locale): HackerNewsSqlDemo {
    const text = labels(locale);
    const initialSql = `${marker}
-- ${text.task}
WITH item_ranks AS (
    SELECT item_id, AVG(rank) AS avg_rank
    FROM hacker_news.top_rankings
    GROUP BY item_id
),
ranked_items AS (
    SELECT r.item_id, r.avg_rank, i.score, i.comment_count, i.domain
    FROM item_ranks r
    JOIN hacker_news.items i ON i.id = r.item_id
    WHERE i.item_type = 'story'
),
top_domains AS (
    SELECT domain, COUNT(*) AS stories
    FROM ranked_items
    WHERE domain IS NOT NULL
    GROUP BY domain
    ORDER BY stories DESC
    LIMIT 1
),
totals AS (
    SELECT COUNT(*) AS stories
    FROM ranked_items
    WHERE domain IS NOT NULL
)
SELECT
    '${sqlString(text.score)}' AS trend,
    ROUND(AVG(score) FILTER (WHERE avg_rank <= 10), 1) AS primary_value,
    ROUND(AVG(score) FILTER (WHERE avg_rank BETWEEN 101 AND 500), 1) AS comparison_value,
    ROUND(
        AVG(score) FILTER (WHERE avg_rank <= 10) /
        NULLIF(AVG(score) FILTER (WHERE avg_rank BETWEEN 101 AND 500), 0),
        2
    ) AS ratio
FROM ranked_items
UNION ALL
SELECT
    '${sqlString(text.discussion)}',
    ROUND(AVG(comment_count) FILTER (WHERE avg_rank <= 50), 1),
    ROUND(AVG(comment_count) FILTER (WHERE avg_rank BETWEEN 451 AND 500), 1),
    ROUND(
        AVG(comment_count) FILTER (WHERE avg_rank <= 50) /
        NULLIF(AVG(comment_count) FILTER (WHERE avg_rank BETWEEN 451 AND 500), 0),
        2
    )
FROM ranked_items
UNION ALL
SELECT
    '${sqlString(text.domain)}' || ' · ' || MAX(top_domains.domain),
    MAX(top_domains.stories),
    MAX(totals.stories),
    ROUND(100.0 * MAX(top_domains.stories) / MAX(totals.stories), 2)
FROM top_domains
CROSS JOIN totals;`;

    const nextSql = `-- ${text.nextTab}
SELECT
    domain,
    COUNT(DISTINCT item_id) AS stories,
    ROUND(AVG(score), 1) AS avg_score,
    ROUND(AVG(comment_count), 1) AS avg_comments
FROM hacker_news.top
WHERE domain IS NOT NULL
GROUP BY domain
HAVING COUNT(DISTINCT item_id) >= 5
ORDER BY stories DESC, avg_score DESC
LIMIT 15;`;

    return {
        tabName: text.tab,
        nextTabName: text.nextTab,
        nextActionLabel: text.next,
        initialSql,
        nextSql,
    };
}
