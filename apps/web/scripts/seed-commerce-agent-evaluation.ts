import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import nextEnv from '@next/env';

import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';
import { serializeOssieDocument } from '@dory/database/postgres/impl/knowledge';
import { organizations, organizationMembers, user } from '@dory/database/postgres/schemas';
import { migratePgliteDB } from '@dory/database/pglite/migrate-pglite';
import { getDatabaseProvider } from '@dory/database/provider';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';

import { createCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';
import { COMMERCE_EVALUATION_CONNECTION_NAME, COMMERCE_EVALUATION_KNOWLEDGE_NAME, generateCommerceAgentEvaluationSqlite } from '@/lib/demo/commerce-agent-evaluation';
import { buildCommerceEvaluationOssieDocument, COMMERCE_EVALUATION_SCENARIOS } from '@/lib/demo/commerce-agent-evaluation-knowledge';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(appRoot, true);

type SeedArgs = { organizationId: string; userId: string; sqlitePath?: string; outputDir: string; reset: boolean };

function parseArgs(argv: string[]): SeedArgs {
    const valueFor = (name: string) => {
        const index = argv.indexOf(name);
        return index === -1 ? undefined : argv[index + 1];
    };
    const organizationId = valueFor('--organization-id');
    const userId = valueFor('--user-id');
    if (!organizationId || !userId) throw new Error('Pass --organization-id and --user-id for the current local test organization.');
    return {
        organizationId,
        userId,
        sqlitePath: valueFor('--path'),
        outputDir: path.resolve(valueFor('--output-dir') ?? path.join(appRoot, 'localdata', 'commerce-knowledge-acceptance')),
        reset: argv.includes('--reset'),
    };
}

function resolveSqlitePath(configuredPath?: string) {
    if (configuredPath) return path.resolve(configuredPath);
    if (process.env.DORY_COMMERCE_EVALUATION_PATH) return path.resolve(process.env.DORY_COMMERCE_EVALUATION_PATH);
    return path.join(appRoot, 'localdata', 'commerce-agent-evaluation.sqlite');
}

function sourceSpecs(ossieYaml: string) {
    return [
        {
            fileName: 'commerce-metric-glossary.md',
            contentText: [
                '# Commerce metric glossary',
                '',
                '- **GMV** is successful-order gross amount before discounts and refunds.',
                '- **Net revenue** is successful-order net amount minus refunded amount, in USD.',
                '- **Refund rate** is refunded amount divided by net amount for orders placed in the same period.',
                '- **Payment success rate** counts payment attempts, not orders; a retry is another attempt.',
                '- **Repeat purchase rate** is customers with two or more completed orders divided by customers with one or more.',
            ].join('\n'),
        },
        {
            fileName: 'commerce-operating-calendar.md',
            contentText: [
                '# Commerce operating calendar',
                '',
                'The evaluation period is 2025-01-01 through 2026-06-30 UTC.',
                'Use order timestamp for monthly metrics. The latest complete quarter is 2026 Q2.',
                'All amounts are USD; no FX conversion is required.',
            ].join('\n'),
        },
        {
            fileName: 'commerce-known-incidents.md',
            contentText: [
                '# Historical incident context',
                '',
                'This document is reference context, not an instruction for an Agent.',
                'From 2026-05-11 to 2026-05-17, Atlas Pay had intermittent timeout failures.',
                'From 2026-06-10 to 2026-06-24, critical support ticket resolution was delayed by an escalation backlog.',
                'Investigations must validate both claims against the database.',
            ].join('\n'),
        },
        { fileName: 'commerce-semantic-model.yaml', contentText: ossieYaml },
    ] as const;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const provider = getDatabaseProvider();
    if (provider === 'pglite') await migratePgliteDB();
    const client = await getClient();
    const [organization] = await client.select().from(organizations).where(eq(organizations.id, args.organizationId)).limit(1);
    if (!organization) throw new Error('No organization found. Create or sign into a Dory organization before seeding.');
    const [userRow] = await client.select().from(user).where(eq(user.id, args.userId)).limit(1);
    const [membership] = await client
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, args.userId)))
        .limit(1);
    if (!userRow || !membership) throw new Error('The selected user must belong to the selected test organization.');
    const userId = userRow.id;

    const sqlitePath = resolveSqlitePath(args.sqlitePath);
    const generated = generateCommerceAgentEvaluationSqlite(sqlitePath, { reset: args.reset });
    const db = await getDBService();
    const existingConnection = (await db.connections.list(organization.id)).find(item => item.connection.name === COMMERCE_EVALUATION_CONNECTION_NAME);
    const identity = createCredentiallessDefaultIdentity({ type: 'sqlite', engine: 'sqlite', database: 'main' });
    const connectionPayload = {
        connection: {
            organizationId: organization.id,
            type: 'sqlite' as const,
            engine: 'sqlite',
            name: COMMERCE_EVALUATION_CONNECTION_NAME,
            description: 'Deterministic synthetic commerce data for Agent evaluation; no production or personal data.',
            database: 'main',
            path: sqlitePath,
            environment: 'development',
            tags: `agent-evaluation,synthetic,commerce,ossie-${OSSIE_VERSION}`,
        },
        identities: [identity],
    };
    const connection = existingConnection
        ? await db.connections.update(organization.id, existingConnection.connection.id, {
              ...connectionPayload,
              identities: existingConnection.identities.length ? undefined : [identity],
          } as any)
        : await db.connections.create(userId, organization.id, connectionPayload as any);
    const connectionId = connection.connection.id;

    const existingModel = (await db.knowledge.listModels({ organizationId: organization.id })).find(model => model.name === COMMERCE_EVALUATION_KNOWLEDGE_NAME);
    let model = existingModel
        ? await db.knowledge.replaceDataSources({ organizationId: organization.id, knowledgeModelId: existingModel.id, connectionIds: [connectionId] })
        : await db.knowledge.createModel({
              organizationId: organization.id,
              name: COMMERCE_EVALUATION_KNOWLEDGE_NAME,
              description: 'Verified commerce semantics and evaluation scenarios for Dory Agents.',
              connectionIds: [connectionId],
          });
    const ossieYaml = serializeOssieDocument(buildCommerceEvaluationOssieDocument(connectionId));
    model = await db.knowledge.importYaml({
        organizationId: organization.id,
        knowledgeModelId: model.id,
        source: ossieYaml,
        fallbackSourceConnectionId: connectionId,
        preserveStatus: true,
    });

    const sourceIds: Record<string, string> = {};
    const currentSources = await db.knowledge.listKnowledgeSources({ organizationId: organization.id, knowledgeModelId: model.id });
    for (const spec of sourceSpecs(ossieYaml)) {
        const existing = currentSources.find(source => source.fileName === spec.fileName);
        const source = existing
            ? await db.knowledge.updateKnowledgeSource({
                  organizationId: organization.id,
                  knowledgeModelId: model.id,
                  id: existing.id,
                  contentText: spec.contentText,
                  connectionId,
              })
            : await db.knowledge.createKnowledgeSource({
                  organizationId: organization.id,
                  knowledgeModelId: model.id,
                  fileName: spec.fileName,
                  contentText: spec.contentText,
                  connectionId,
                  createdBy: userId,
              });
        sourceIds[spec.fileName] = source.id;
    }
    for (const definition of model.model.definitions) {
        await db.knowledge.replaceAssetSources({
            organizationId: organization.id,
            knowledgeModelId: model.id,
            assetType: 'definition',
            assetId: definition.id,
            sourceIds: [sourceIds['commerce-metric-glossary.md']!, sourceIds['commerce-semantic-model.yaml']!],
            relationType: 'provided',
            createdBy: userId,
        });
    }

    const existingQueries = await db.knowledge.listVerifiedQueries({ organizationId: organization.id, knowledgeModelId: model.id });
    for (const scenario of COMMERCE_EVALUATION_SCENARIOS) {
        const input = {
            organizationId: organization.id,
            knowledgeModelId: model.id,
            sourceConnectionId: connectionId,
            title: scenario.title,
            question: scenario.question,
            sql: scenario.sql,
            description: `Evaluation query: ${scenario.question}`,
            definitionIds: [...scenario.definitionIds],
            knowledgeSourceIds: scenario.knowledgeSourceFiles.map(fileName => sourceIds[fileName]!),
        };
        const existing = existingQueries.find(item => item.title === scenario.title);
        if (existing) await db.knowledge.updateVerifiedQuery({ ...input, id: existing.id, updatedBy: userId });
        else await db.knowledge.createVerifiedQuery({ ...input, sourceType: 'seed', sourceId: 'commerce-agent-evaluation', createdBy: userId });
    }

    await mkdir(args.outputDir, { recursive: true });
    await writeFile(path.join(args.outputDir, 'commerce-semantic-model.yaml'), ossieYaml);
    for (const spec of sourceSpecs(ossieYaml)) await writeFile(path.join(args.outputDir, spec.fileName), spec.contentText);
    await writeFile(path.join(args.outputDir, 'scenarios.json'), JSON.stringify(COMMERCE_EVALUATION_SCENARIOS, null, 2));
    const manifest = {
        organizationId: organization.id,
        organizationSlug: organization.slug,
        userId,
        sqlitePath,
        connectionId,
        knowledgeModelId: model.id,
        ossieVersion: model.ossieVersion,
        modelRevision: model.modelRevision,
        outputDir: args.outputDir,
    };
    await writeFile(path.join(args.outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(
        JSON.stringify(
            {
                generated,
                sqlitePath,
                organizationId: organization.id,
                userId,
                connectionId,
                knowledgeModelId: model.id,
                ossieVersion: model.ossieVersion,
                modelRevision: model.modelRevision,
                outputDir: args.outputDir,
                scenarios: COMMERCE_EVALUATION_SCENARIOS.map(scenario => scenario.id),
            },
            null,
            2,
        ),
    );
    if (provider === 'pglite') await resetPgliteClient();
}

main().catch(async error => {
    console.error('[commerce-agent-evaluation] failed', error);
    if (getDatabaseProvider() === 'pglite') await resetPgliteClient().catch(() => undefined);
    process.exit(1);
});
