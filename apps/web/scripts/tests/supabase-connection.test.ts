import assert from 'node:assert/strict';
import test from 'node:test';
import type { RefinementCtx } from 'zod';
import { buildPostgresPoolConfig } from '../../../../packages/drivers/src/database/postgres/runtime';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';
import { getSqlDialectConfigForConnectionType } from '@/lib/sql/sql-dialect';
import {
    normalizeSupabaseConnectionForSubmit,
    normalizeSupabaseIdentityFromConnectionString,
    parseSupabaseConnectionString,
    validateSupabaseConnection,
} from '@/app/(app)/[organization]/connections/components/forms/connection/drivers/supabase';

test('Supabase connection string parser supports direct and session pooler URLs', () => {
    const direct = parseSupabaseConnectionString('postgresql://postgres:secret@db.project-ref.supabase.co:5432/postgres?sslmode=require');
    assert.equal(direct.host, 'db.project-ref.supabase.co');
    assert.equal(direct.port, 5432);
    assert.equal(direct.database, 'postgres');
    assert.equal(direct.username, 'postgres');
    assert.equal(direct.password, 'secret');
    assert.equal(direct.ssl, true);
    assert.equal(direct.isTransactionPooler, false);
    assert.equal(direct.searchParams.sslmode, 'require');

    const pooler = parseSupabaseConnectionString('postgresql://postgres.project-ref:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres');
    assert.equal(pooler.host, 'aws-0-us-east-1.pooler.supabase.com');
    assert.equal(pooler.username, 'postgres.project-ref');
    assert.equal(pooler.ssl, true);
    assert.equal(pooler.isTransactionPooler, false);
});

test('Supabase connection string parser detects transaction pooler URLs', () => {
    const parsed = parseSupabaseConnectionString('postgresql://postgres.project-ref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require');
    assert.equal(parsed.port, 6543);
    assert.equal(parsed.isTransactionPooler, true);
});

test('Supabase connection validation rejects missing username and non-Postgres URLs', () => {
    const issues: Array<{ path?: Array<string | number>; message: string }> = [];
    const ctx = {
        addIssue(issue: { path?: Array<string | number>; message: string }) {
            issues.push(issue);
        },
    };

    validateSupabaseConnection({ host: 'postgresql://db.project-ref.supabase.co:5432/postgres?sslmode=require' }, ctx as unknown as RefinementCtx);
    validateSupabaseConnection({ host: 'https://project-ref.supabase.co' }, ctx as unknown as RefinementCtx);

    assert.equal(issues.length, 2);
    assert.ok(issues.every(issue => issue.path?.join('.') === 'connection.host'));
});

test('Supabase submit normalization stores Postgres-family connection config', () => {
    const connectionString = 'postgresql://postgres.project-ref:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';
    const normalized = normalizeSupabaseConnectionForSubmit({
        type: 'supabase',
        host: connectionString,
        database: 'postgres',
    });
    const identity = normalizeSupabaseIdentityFromConnectionString(connectionString);
    const options = JSON.parse(normalized.options);

    assert.equal(normalized.type, 'supabase');
    assert.equal(normalized.engine, 'postgres');
    assert.equal(normalized.host, 'aws-0-us-east-1.pooler.supabase.com');
    assert.equal(normalized.port, 5432);
    assert.equal(normalized.database, 'postgres');
    assert.equal(identity.name, 'Supabase');
    assert.equal(identity.username, 'postgres.project-ref');
    assert.equal(identity.password, 'secret');
    assert.equal(options.connectionString, connectionString);
    assert.equal(options.ssl, true);
    assert.equal(options.sslmode, 'require');
});

test('Supabase uses Postgres family behavior and pool connection strings', () => {
    assert.equal(isPostgresFamilyConnectionType('supabase'), true);
    assert.equal(getSqlDialectConfigForConnectionType('supabase').dialect, 'postgres');

    const poolConfig = buildPostgresPoolConfig(
        {
            id: 'supabase-1',
            type: 'supabase',
            host: 'aws-0-us-east-1.pooler.supabase.com',
            port: 5432,
            username: 'postgres.project-ref',
            password: 'secret',
            database: 'postgres',
            options: {
                connectionString: 'postgresql://postgres.project-ref:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
                ssl: true,
                sslmode: 'require',
            },
        },
        'analytics',
    );

    assert.equal(poolConfig.host, 'aws-0-us-east-1.pooler.supabase.com');
    assert.equal(poolConfig.database, 'analytics');
    assert.equal(typeof poolConfig.connectionString, 'string');

    const url = new URL(String(poolConfig.connectionString));
    assert.equal(url.hostname, 'aws-0-us-east-1.pooler.supabase.com');
    assert.equal(url.pathname, '/analytics');
    assert.equal(url.searchParams.get('sslmode'), 'require');
});
