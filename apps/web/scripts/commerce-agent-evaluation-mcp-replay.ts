import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type JsonRecord = Record<string, unknown>;

const endpoint = process.env.DORY_MCP_URL ?? 'http://localhost:3000/api/mcp';
const token = process.env.DORY_MCP_TOKEN;
const configuredConnectionId = process.env.DORY_COMMERCE_EVALUATION_CONNECTION_ID;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toolPayload(result: unknown): JsonRecord {
    if (isRecord(result) && isRecord(result.structuredContent)) return result.structuredContent;
    if (isRecord(result) && Array.isArray(result.content)) {
        const text = result.content.find(item => isRecord(item) && item.type === 'text');
        if (isRecord(text) && typeof text.text === 'string') {
            const parsed: unknown = JSON.parse(text.text);
            if (isRecord(parsed)) return parsed;
        }
    }
    throw new Error('MCP tool returned an unexpected payload.');
}

function requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value) throw new Error(`Missing ${field} in MCP response.`);
    return value;
}

function assetRefs(payload: JsonRecord) {
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    return assets
        .filter(isRecord)
        .map(asset => asset.ref)
        .filter((ref): ref is string => typeof ref === 'string');
}

async function main() {
    if (!token) {
        throw new Error('Set DORY_MCP_TOKEN to a read-only Commerce service-account token before running this replay.');
    }

    const client = new Client({ name: 'commerce-agent-evaluation-replay', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
    });

    await client.connect(transport);
    try {
        const call = async (name: string, args: JsonRecord) => toolPayload(await client.callTool({ name, arguments: args }));

        // These calls intentionally do not include workId: they should be recorded only as Agent audit activity.
        const assetSearch = await call('dory_search_assets', { query: '支付成功率', kinds: ['knowledge_definition', 'verified_query'] });
        const ref = assetRefs(assetSearch)[0];
        if (!ref) throw new Error('The seeded payment-success Knowledge asset was not discoverable.');
        await call('dory_read_asset', { ref });

        const connections = await call('dory_list_connections', {});
        const connectionRows = Array.isArray(connections.connections) ? connections.connections.filter(isRecord) : [];
        const connection = connectionRows.find(item => item.connectionId === configuredConnectionId || item.name === 'Commerce Agent Evaluation');
        const connectionId = configuredConnectionId ?? (connection && typeof connection.connectionId === 'string' ? connection.connectionId : undefined);
        if (!connectionId) throw new Error('Commerce Agent Evaluation is not visible to this token. Check its connection allowlist and assets:read/read scopes.');

        const work = await call('dory_create_work', {
            connectionId,
            title: 'Commerce payment incident investigation',
            userQuestion: 'Identify the 2026-05-11 to 2026-05-17 payment failure anomaly.',
        });
        const workId = requireString(work.workId, 'workId');

        // Once a SQL work exists, contextual reads belong to its existing activity timeline.
        await call('dory_search_assets', { query: '支付渠道失败率', kinds: ['verified_query'], workId });
        await call('dory_read_asset', { ref, workId });
        await call('dory_explore_schema', { operation: 'describe_table', connectionId, database: 'main', table: 'payments', workId });
        const sql = await call('dory_run_readonly_sql', {
            connectionId,
            workId,
            database: 'main',
            maxRows: 20,
            workspaceMode: 'create_tab',
            tabName: 'Payment incident evidence',
            sql: "SELECT provider, COUNT(*) AS attempts, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts, ROUND(100.0 * AVG(CASE WHEN status = 'failed' THEN 1.0 ELSE 0.0 END), 2) AS failure_rate_pct FROM payments WHERE attempted_at >= '2026-05-11' AND attempted_at < '2026-05-18' GROUP BY provider ORDER BY failure_rate_pct DESC;",
        });
        const artifacts = Array.isArray(sql.artifacts) ? sql.artifacts.filter(isRecord) : [];
        const evidenceArtifactIds = artifacts.map(artifact => artifact.artifactId).filter((id): id is string => typeof id === 'string');
        if (!evidenceArtifactIds.length) throw new Error('The SQL replay did not return a persisted Artifact ID.');

        await call('dory_finish_work', {
            workId,
            status: 'completed',
            summaryTitle: 'Atlas Pay failure-rate incident',
            findings: [
                {
                    title: 'Atlas Pay failure rate was 36.84% during the incident week.',
                    content:
                        'The deterministic evaluation dataset injects an Atlas Pay timeout incident for this window. Review the Artifact for the measured rate and competing providers.',
                    evidenceArtifactIds,
                    isPrimary: true,
                    presentation: {
                        metricLabel: 'Atlas Pay failure rate',
                        metricValue: '36.84',
                        metricUnit: '%',
                        timeframe: 'Incident week · 2026-05-11 to 2026-05-17',
                        dimensions: ['Atlas Pay', 'payments'],
                            facts: [
                                { label: 'Failed payments', value: '14' },
                                { label: 'Total payments', value: '38' },
                            { label: 'Result rows', value: '3' },
                        ],
                    },
                },
            ],
            steps: ['Searched and read verified payment knowledge.', 'Inspected the payments schema.', 'Executed the incident aggregation and saved its Artifact.'],
        });

        console.log(JSON.stringify({ ok: true, connectionId, workId, assetRef: ref, evidenceArtifactIds }, null, 2));
    } finally {
        await client.close();
    }
}

main().catch(error => {
    console.error('[commerce-agent-evaluation:mcp] failed', error instanceof Error ? error.message : error);
    process.exit(1);
});
