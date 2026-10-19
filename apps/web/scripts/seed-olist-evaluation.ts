import { readFile, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import nextEnv from '@next/env';
import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';
import { serializeOssieDocument } from '@dory/database/postgres/impl/knowledge';
import { organizationMembers, organizations } from '@dory/database/postgres/schemas';
import { getDatabaseProvider } from '@dory/database/provider';
import type { ConnectionPayload } from '@dory/shared/types/connections';
import { generateMcpToken, hashMcpToken } from '@dory/server-core/tokens';

import { createCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';
import { verifyOlistFixture } from './olist/fixture';
import { buildOlistOssieDocument, OLIST_CONNECTION_NAME, OLIST_KNOWLEDGE_NAME } from '@/lib/demo/olist-evaluation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root, true);

async function main() {
    const args = process.argv.slice(2);
    const value = (name: string) => args[args.indexOf(name) + 1];
    const organizationId = args.includes('--organization-id') ? value('--organization-id') : undefined;
    const userId = args.includes('--user-id') ? value('--user-id') : undefined;
    if (!organizationId || !userId) throw new Error('Pass --organization-id and --user-id for a local test organization. Stop the app before using this offline seed with PGlite.');
    const directory = path.resolve(args.includes('--output-dir') ? value('--output-dir') : path.join(root, 'localdata', 'olist-evaluation'));
    const data = JSON.parse(await readFile(path.join(directory, 'data-manifest.json'), 'utf8')) as {
        benchmarkEligible: boolean;
        sqlitePath: string;
        timeRange: { min: string; max: string };
        source: string;
        datasetVersionNumber: number;
        files: Record<string, { sha256: string }>;
    };
    if (!data.benchmarkEligible || data.datasetVersionNumber !== 2) throw new Error('Run olist:evaluation:prepare successfully first.');
    await verifyOlistFixture(directory);
    if (getDatabaseProvider() === 'pglite') {
        const origin = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');
        const listening = await new Promise<boolean>(resolve => {
            const socket = connect({ host: origin.hostname, port: Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)) });
            socket.setTimeout(1000);
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', () => resolve(false));
            socket.once('timeout', () => {
                socket.destroy();
                resolve(false);
            });
        });
        if (listening) throw new Error('Stop the Dory server before seeding PGlite; concurrent access to its data directory is unsupported.');
    }
    const client = await getClient();
    const [organization] = await client.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    const [member] = await client
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
        .limit(1);
    if (!organization || !member) throw new Error('Selected user must belong to the selected test organization.');
    const db = await getDBService();
    const existing = (await db.connections.list(organizationId)).find(item => item.connection.name === OLIST_CONNECTION_NAME);
    if (existing && (existing.connection.type !== 'sqlite' || !existing.connection.tags.includes('olist') || existing.connection.environment !== 'development')) {
        throw new Error('A non-fixture connection already uses the Olist evaluation name; refusing to overwrite it.');
    }
    const payload: ConnectionPayload = {
        connection: {
            organizationId,
            host: null,
            port: null,
            type: 'sqlite',
            engine: 'sqlite',
            name: OLIST_CONNECTION_NAME,
            path: data.sqlitePath,
            database: 'main',
            environment: 'development',
            description: 'Olist v2 historical public data; local acceptance only; CC BY-NC-SA 4.0.',
            tags: 'olist,evaluation,historical',
        },
        identities: [
            {
                ...createCredentiallessDefaultIdentity({ type: 'sqlite', engine: 'sqlite', database: 'main' }),
                role: '',
                password: undefined,
                database: 'main',
                organizationId,
                connectionId: existing?.connection.id ?? '',
            },
        ],
    };
    const connection = existing
        ? await db.connections.update(organizationId, existing.connection.id, { ...payload, identities: existing.identities.length ? [] : payload.identities })
        : await db.connections.create(userId, organizationId, payload);
    const connectionId = connection.connection.id;
    const models = await db.knowledge.listModels({ organizationId });
    const existingModel = models.find(model => model.name === OLIST_KNOWLEDGE_NAME);
    if (existingModel && (existingModel.dataSources.length !== 1 || existingModel.dataSources[0].connectionId !== connectionId)) {
        throw new Error('A Knowledge model with this name belongs to another connection; refusing to overwrite it.');
    }
    const model = existingModel
        ? await db.knowledge.replaceDataSources({ organizationId, knowledgeModelId: existingModel.id, connectionIds: [connectionId] })
        : await db.knowledge.createModel({
              organizationId,
              name: OLIST_KNOWLEDGE_NAME,
              description: 'Verified Olist definitions and historical data limitations.',
              connectionIds: [connectionId],
          });
    const yaml = serializeOssieDocument(buildOlistOssieDocument(connectionId, data.timeRange));
    const imported = await db.knowledge.importYaml({ organizationId, knowledgeModelId: model.id, source: yaml, fallbackSourceConnectionId: connectionId, preserveStatus: true });
    const sources = {
        'olist-source.md': `# Olist source\n${data.source}\nVersion: 2\nLicense: CC BY-NC-SA 4.0. Attribution: Olist. Local acceptance only, not distributed with Dory.\nSource timestamps have no declared timezone and must be preserved. Currency: BRL.\nCoverage: ${data.timeRange.min} to ${data.timeRange.max}.\n`,
        'olist-metrics.md':
            '# Metric glossary\nDelivered merchandise amount excludes freight. AOV uses delivered orders, including those missing item rows. Repeat purchase uses customer_unique_id, with first delivered order state attribution. Late deliveries compare calendar dates; same-day delivery is on time. Payment amounts include freight and count each payment record. Refund rate, net profit and payment success rate are unavailable because refund amounts, costs and payment attempt outcomes are absent.\n',
        'olist-quality.md': '# Data quality manifest\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```\n',
    };
    const current = await db.knowledge.listKnowledgeSources({ organizationId, knowledgeModelId: model.id });
    for (const [fileName, contentText] of Object.entries(sources)) {
        const found = current.find(source => source.fileName === fileName);
        const input = { organizationId, knowledgeModelId: model.id, connectionId, contentText };
        if (found) await db.knowledge.updateKnowledgeSource({ ...input, id: found.id });
        else await db.knowledge.createKnowledgeSource({ ...input, fileName, createdBy: userId });
    }
    // Helpful examples are deliberately disjoint from the held-out Agent questions.
    const examples = [
        {
            title: 'Olist status distribution',
            question: '数据中有哪些订单状态？',
            sql: 'SELECT order_status, COUNT(*) order_count FROM orders GROUP BY order_status ORDER BY order_status',
        },
        {
            title: 'Olist item coverage',
            question: '有多少订单缺少商品明细？',
            sql: 'SELECT COUNT(*) missing_orders FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.order_id)',
        },
    ];
    const queries = await db.knowledge.listVerifiedQueries({ organizationId, knowledgeModelId: model.id });
    for (const example of examples) {
        const input = { ...example, organizationId, knowledgeModelId: model.id, sourceConnectionId: connectionId };
        const found = queries.find(query => query.title === example.title);
        if (found) await db.knowledge.updateVerifiedQuery({ ...input, id: found.id, updatedBy: userId });
        else await db.knowledge.createVerifiedQuery({ ...input, sourceType: 'seed', sourceId: 'olist-evaluation', createdBy: userId });
    }
    const manifest = {
        organizationId,
        organizationSlug: organization.slug,
        userId,
        connectionId,
        knowledgeModelId: model.id,
        modelRevision: imported.modelRevision,
        ossieVersion: imported.ossieVersion,
        sqlitePath: data.sqlitePath,
    };
    await writeFile(path.join(directory, 'olist-semantic-model.yaml'), yaml);
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (args.includes('--token-file')) {
        const tokenPath = path.resolve(value('--token-file'));
        // Explicit opt-in, short-lived and restricted to this fixture connection.
        const token = generateMcpToken();
        await writeFile(tokenPath, token, { mode: 0o600, flag: 'wx' });
        try {
            await db.mcp.createToken({
                organizationId,
                createdByUserId: userId,
                name: 'Olist acceptance (6h)',
                tokenPrefix: token.slice(0, 17),
                tokenHash: hashMcpToken(token),
                scopes: ['read', 'tabs:write', 'analysis:run'],
                allowedConnectionIds: [connectionId],
                expiresAt: new Date(Date.now() + 6 * 3600000),
            });
        } catch (error) {
            const { unlink } = await import('node:fs/promises');
            await unlink(tokenPath);
            throw error;
        }
    }
    console.log(JSON.stringify(manifest, null, 2));
}

main()
    .catch(async error => {
        console.error('[olist:seed]', error instanceof Error ? error.message : error);
        if (getDatabaseProvider() === 'pglite') await resetPgliteClient();
        process.exit(1);
    })
    .finally(async () => {
        if (getDatabaseProvider() === 'pglite') await resetPgliteClient();
    });
