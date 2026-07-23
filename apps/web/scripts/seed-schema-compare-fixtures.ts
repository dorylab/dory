import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nextEnv from '@next/env';
import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';
import { organizations } from '@dory/database/postgres/schemas/organizations/organizations';
import type { ConnectionPayload } from '@dory/shared/types/connections';

import { createCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';
import { createSchemaComparison } from '@/lib/comparison/service';
import { generateSchemaCompareFixtures, type GeneratedSchemaCompareFixture, type SchemaCompareFixtureSide } from '@/lib/demo/schema-compare-fixtures';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(appDirectory, true);

function argumentValue(name: string) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function connectionPayload(organizationId: string, fixture: GeneratedSchemaCompareFixture, side: SchemaCompareFixtureSide, filePath: string): ConnectionPayload {
    const identity = createCredentiallessDefaultIdentity({
        type: 'sqlite',
        engine: 'sqlite',
        database: 'main',
    });
    return {
        connection: {
            organizationId,
            type: 'sqlite',
            engine: 'sqlite',
            name: side.name,
            description: `${fixture.expected} Fixture: ${fixture.id}.`,
            host: null,
            port: null,
            database: 'main',
            path: filePath,
            status: 'Connected',
            environment: side.environment,
            tags: 'blue',
        },
        identities: [
            {
                ...identity,
                connectionId: '',
                organizationId,
                role: undefined,
                password: undefined,
                database: 'main',
                options: '{}',
            },
        ],
        ssh: null,
    };
}

async function upsertFixtureConnection(input: {
    db: Awaited<ReturnType<typeof getDBService>>;
    userId: string;
    organizationId: string;
    fixture: GeneratedSchemaCompareFixture;
    side: SchemaCompareFixtureSide;
    filePath: string;
}) {
    const existing = (await input.db.connections.list(input.organizationId)).find(item => item.connection.name === input.side.name);
    const payload = connectionPayload(input.organizationId, input.fixture, input.side, input.filePath);
    if (existing) {
        const connection = await input.db.connections.update(input.organizationId, existing.connection.id, {
            ...payload,
            identities: [],
        });
        return { status: 'updated' as const, connection };
    }
    const connection = await input.db.connections.create(input.userId, input.organizationId, payload);
    return { status: 'created' as const, connection };
}

async function main() {
    const selector = argumentValue('--organization');
    const fixtureDirectory = argumentValue('--directory') ?? path.join(appDirectory, '.tmp', 'schema-compare-fixtures');
    const fixtures = generateSchemaCompareFixtures(fixtureDirectory);
    const client = await getClient();
    const db = await getDBService();
    const availableOrganizations = await client
        .select({
            id: organizations.id,
            slug: organizations.slug,
            name: organizations.name,
            ownerUserId: organizations.ownerUserId,
        })
        .from(organizations);
    const selectedOrganizations = selector ? availableOrganizations.filter(organization => organization.id === selector || organization.slug === selector) : availableOrganizations;

    if (selectedOrganizations.length === 0) {
        throw new Error(selector ? `Organization "${selector}" was not found.` : 'No Dory organizations were found.');
    }

    for (const organization of selectedOrganizations) {
        console.log(`\n[schema-compare-fixtures] ${organization.name} (${organization.slug})`);
        const knownComparisons = (await db.comparisons.list(organization.id, { limit: 100 })).rows;
        for (const fixture of fixtures) {
            const current = await upsertFixtureConnection({
                db,
                userId: organization.ownerUserId,
                organizationId: organization.id,
                fixture,
                side: fixture.current,
                filePath: fixture.currentPath,
            });
            const desired = await upsertFixtureConnection({
                db,
                userId: organization.ownerUserId,
                organizationId: organization.id,
                fixture,
                side: fixture.desired,
                filePath: fixture.desiredPath,
            });
            const existingComparison = knownComparisons.find(
                comparison =>
                    comparison.status === 'success' &&
                    comparison.currentEndpoint.connectionId === current.connection.connection.id &&
                    comparison.desiredEndpoint.connectionId === desired.connection.connection.id &&
                    comparison.currentEndpoint.database === 'main' &&
                    comparison.desiredEndpoint.database === 'main',
            );
            const comparison = existingComparison
                ? { job: existingComparison, comparison: null }
                : await createSchemaComparison(db, {
                      organizationId: organization.id,
                      userId: organization.ownerUserId,
                      current: {
                          connectionId: current.connection.connection.id,
                          identityId: current.connection.identities.find(identity => identity.isDefault)?.id ?? null,
                          database: 'main',
                      },
                      desired: {
                          connectionId: desired.connection.connection.id,
                          identityId: desired.connection.identities.find(identity => identity.isDefault)?.id ?? null,
                          database: 'main',
                      },
                  });
            if (!existingComparison) knownComparisons.push(comparison.job);

            console.log(`  ${fixture.title}: ${current.status}/${desired.status}`);
            console.log(`    Current: ${fixture.current.name}`);
            console.log(`    Desired: ${fixture.desired.name}`);
            console.log(`    Expected: ${fixture.expected}`);
            console.log(
                `    Comparison: ${comparison.job.id} (${existingComparison ? 'reused' : 'created'}, ${comparison.comparison?.summary.readiness ?? comparison.job.summary?.readiness ?? 'unknown'})`,
            );
        }
        console.log(`  Open: /${organization.slug}/compare`);
    }
}

main()
    .catch(error => {
        const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
        if (/Aborted|RuntimeError/i.test(String(cause ?? ''))) {
            console.error(
                '[schema-compare-fixtures] PGlite appears to be open in another process. Stop the local dev server before running this seed command, or use the opt-in live Playwright command documented in docs/schema-compare.md.',
            );
        }
        console.error('[schema-compare-fixtures] failed', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await resetPgliteClient().catch(() => undefined);
    });
