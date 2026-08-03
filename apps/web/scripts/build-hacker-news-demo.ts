import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { DuckDBInstance } from '@duckdb/node-api';

const execFileAsync = promisify(execFile);
const PLAY_CONNECTION_ID = process.env.DORY_HACKER_NEWS_SOURCE_CONNECTION_ID ?? '019e8917-a22d-76a3-844a-5525bc70151f';
const outputDir = path.resolve(process.cwd(), 'public/resources');
const databasePath = path.join(outputDir, 'hacker-news-demo.duckdb');
const manifestPath = path.join(outputDir, 'hacker-news-demo.manifest.json');

type SnapshotRow = { snapshot_at: string; ids: Array<number | string> };
type ItemRow = {
    id: number | string;
    item_type: string;
    author: string;
    created_at: string;
    title: string;
    url: string;
    score: number | string;
    comment_count: number | string;
    deleted: number | string;
    dead: number | string;
    captured_at: string;
};

type SnapshotBatch = { snapshot_ats: string[]; snapshot_ids: Array<Array<number | string>> };
type ItemBatch = {
    ids: Array<number | string>;
    item_types: string[];
    authors: string[];
    created_ats: string[];
    titles: string[];
    urls: string[];
    scores: Array<number | string>;
    comment_counts: Array<number | string>;
    deleted_values: Array<number | string>;
    dead_values: Array<number | string>;
    captured_ats: string[];
};

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

async function runDoryQuery(sql: string, limit = 1_000) {
    const input = JSON.stringify({ connectionId: PLAY_CONNECTION_ID, database: 'default', sql, limit });
    const { stdout } = await execFileAsync('dory', ['action', 'query.readOnlyExecute', '--data', 'desktop', '--projection', 'mcp', '--json', input], {
        maxBuffer: 128 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout) as { ok?: boolean; data?: { results?: unknown[][] } };
    if (!payload.ok) throw new Error('Dory Hacker News export query failed');
    return (payload.data?.results?.[0] ?? []) as Array<Record<string, unknown>>;
}

function hostname(url: string) {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

async function writeNdjson(filePath: string, rows: Array<Record<string, unknown>>) {
    await writeFile(filePath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

async function main() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dory-hn-demo-'));
    const snapshotFile = path.join(tempDir, 'rankings.ndjson');
    const itemFile = path.join(tempDir, 'items.ndjson');

    try {
        const [snapshotBatch] = (await runDoryQuery(`
            WITH latest AS (SELECT max(update_time) AS value FROM default.hackernews_top WHERE type = 'top')
            SELECT
                groupArray(formatDateTime(snapshot_at, '%F %T')) AS snapshot_ats,
                groupArray(ids) AS snapshot_ids
            FROM (
                SELECT toStartOfHour(update_time) AS snapshot_at, argMax(ids, update_time) AS ids
                FROM default.hackernews_top
                WHERE type = 'top' AND update_time >= (SELECT value FROM latest) - INTERVAL 30 DAY
                GROUP BY snapshot_at
                ORDER BY snapshot_at
            )
        `)) as unknown as SnapshotBatch[];
        if (!snapshotBatch) throw new Error('Hacker News snapshot query returned no data');
        const snapshots: SnapshotRow[] = snapshotBatch.snapshot_ats.map((snapshotAt, index) => ({
            snapshot_at: snapshotAt,
            ids: snapshotBatch.snapshot_ids[index] ?? [],
        }));

        const rankingRows = snapshots.flatMap(snapshot =>
            snapshot.ids.slice(0, 500).map((itemId, index) => ({
                snapshot_at: snapshot.snapshot_at,
                rank: index + 1,
                item_id: Number(itemId),
            })),
        );
        const itemIds = [...new Set(rankingRows.map(row => row.item_id))].sort((a, b) => a - b);
        const items: ItemRow[] = [];

        for (let offset = 0; offset < itemIds.length; offset += 750) {
            const chunk = itemIds.slice(offset, offset + 750);
            const [batch] = (await runDoryQuery(`
                SELECT
                    groupArray(id) AS ids,
                    groupArray(item_type) AS item_types,
                    groupArray(author) AS authors,
                    groupArray(created_at) AS created_ats,
                    groupArray(title) AS titles,
                    groupArray(url) AS urls,
                    groupArray(score) AS scores,
                    groupArray(comment_count) AS comment_counts,
                    groupArray(deleted) AS deleted_values,
                    groupArray(dead) AS dead_values,
                    groupArray(captured_at) AS captured_ats
                FROM (
                    SELECT
                        id,
                        argMax(toString(type), update_time) AS item_type,
                        argMax(by, update_time) AS author,
                        formatDateTime(argMax(time, update_time), '%F %T') AS created_at,
                        argMax(title, update_time) AS title,
                        argMax(url, update_time) AS url,
                        argMax(score, update_time) AS score,
                        argMax(descendants, update_time) AS comment_count,
                        argMax(deleted, update_time) AS deleted,
                        argMax(dead, update_time) AS dead,
                        formatDateTime(max(update_time), '%F %T') AS captured_at
                    FROM default.hackernews_history
                    WHERE id IN (${chunk.join(',')})
                    GROUP BY id
                    ORDER BY id
                )
            `)) as unknown as ItemBatch[];
            if (!batch) continue;
            items.push(
                ...batch.ids.map((id, index) => ({
                    id,
                    item_type: batch.item_types[index] ?? '',
                    author: batch.authors[index] ?? '',
                    created_at: batch.created_ats[index] ?? '1970-01-01 00:00:00',
                    title: batch.titles[index] ?? '',
                    url: batch.urls[index] ?? '',
                    score: batch.scores[index] ?? 0,
                    comment_count: batch.comment_counts[index] ?? 0,
                    deleted: batch.deleted_values[index] ?? 0,
                    dead: batch.dead_values[index] ?? 0,
                    captured_at: batch.captured_ats[index] ?? '1970-01-01 00:00:00',
                })),
            );
        }

        const normalizedItems = items.map(item => ({
            id: Number(item.id),
            item_type: item.item_type,
            author: item.author,
            created_at: item.created_at,
            title: item.title,
            url: item.url,
            domain: hostname(item.url),
            score: Number(item.score),
            comment_count: Number(item.comment_count),
            deleted: Boolean(Number(item.deleted)),
            dead: Boolean(Number(item.dead)),
            captured_at: item.captured_at,
        }));

        await writeNdjson(snapshotFile, rankingRows);
        await writeNdjson(itemFile, normalizedItems);
        await rm(databasePath, { force: true });

        const instance = await DuckDBInstance.create(databasePath);
        const connection = await instance.connect();
        try {
            await connection.run(`CREATE SCHEMA hacker_news`);
            await connection.run(`
                CREATE TABLE hacker_news.top_rankings AS
                SELECT CAST(snapshot_at AS TIMESTAMP) AS snapshot_at, CAST(rank AS INTEGER) AS rank, CAST(item_id AS BIGINT) AS item_id
                FROM read_json_auto(${quoteLiteral(snapshotFile)}, format = 'newline_delimited')
            `);
            await connection.run(`
                CREATE TABLE hacker_news.items AS
                SELECT
                    CAST(id AS BIGINT) AS id,
                    item_type,
                    author,
                    CAST(created_at AS TIMESTAMP) AS created_at,
                    title,
                    url,
                    domain,
                    CAST(score AS INTEGER) AS score,
                    CAST(comment_count AS INTEGER) AS comment_count,
                    CAST(deleted AS BOOLEAN) AS deleted,
                    CAST(dead AS BOOLEAN) AS dead,
                    CAST(captured_at AS TIMESTAMP) AS captured_at
                FROM read_json_auto(${quoteLiteral(itemFile)}, format = 'newline_delimited')
            `);
            await connection.run(`CREATE INDEX idx_hn_items_id ON hacker_news.items(id)`);
            await connection.run(`CREATE INDEX idx_hn_rankings_item ON hacker_news.top_rankings(item_id)`);
            await connection.run(`
                CREATE VIEW hacker_news.top AS
                SELECT r.snapshot_at, r.rank, i.*
                FROM hacker_news.top_rankings r
                LEFT JOIN hacker_news.items i ON i.id = r.item_id
            `);
            await connection.run(`CHECKPOINT`);
        } finally {
            connection.closeSync();
            instance.closeSync();
        }

        const matchedIds = new Set(normalizedItems.map(item => item.id));
        const matchedRankingRows = rankingRows.filter(row => matchedIds.has(row.item_id)).length;
        const manifest = {
            version: 1,
            source: 'Dory play/default.hackernews_top + default.hackernews_history',
            capturedAt: snapshots.at(-1)?.snapshot_at ?? null,
            rangeStart: snapshots[0]?.snapshot_at ?? null,
            rangeEnd: snapshots.at(-1)?.snapshot_at ?? null,
            snapshotCount: snapshots.length,
            rankingRowCount: rankingRows.length,
            uniqueItemCount: normalizedItems.length,
            matchedRankingRows,
            matchRate: rankingRows.length ? matchedRankingRows / rankingRows.length : 0,
            tables: ['hacker_news.top_rankings', 'hacker_news.items', 'hacker_news.top'],
        };
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(manifest, null, 2));
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

await main();
