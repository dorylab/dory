import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSqlResultTitle, resolveArtifactWorkspaceTarget } from '@dory/database/postgres/impl/artifacts';
import { buildArtifactWorkspacePath } from '@/lib/artifacts/workspace-url';
import { resolveInitialResultTargetTabId, type SqlWorkspaceInitialResultTarget } from '@/app/(app)/[organization]/[connectionId]/sql-console/initial-result-target';

const sqlResultSet = {
    connectionId: 'conn-1',
    tabId: 'tab-1',
    sessionId: 'session-1',
    setIndex: 2,
    sql: 'select * from orders',
    workId: null,
};

test('resolves manual SQL and agent Artifact workspace targets', () => {
    assert.deepEqual(
        resolveArtifactWorkspaceTarget({
            type: 'result_set',
            comparisonId: null,
            artifactWorkId: null,
            resultSet: sqlResultSet,
        }),
        {
            mode: 'sql',
            workId: null,
            connectionId: 'conn-1',
            tabId: 'tab-1',
            sessionId: 'session-1',
            setIndex: 2,
            sql: 'select * from orders',
        },
    );

    assert.equal(
        resolveArtifactWorkspaceTarget({
            type: 'chart',
            comparisonId: null,
            artifactWorkId: 'work-1',
            resultSet: sqlResultSet,
        })?.mode,
        'agent',
    );
});

test('does not expose Open for files, comparisons, or incomplete SQL context', () => {
    assert.equal(resolveArtifactWorkspaceTarget({ type: 'file', comparisonId: null, artifactWorkId: null, resultSet: sqlResultSet }), null);
    assert.equal(resolveArtifactWorkspaceTarget({ type: 'result_set', comparisonId: 'comparison-1', artifactWorkId: null, resultSet: sqlResultSet }), null);
    assert.equal(
        resolveArtifactWorkspaceTarget({
            type: 'result_set',
            comparisonId: null,
            artifactWorkId: null,
            resultSet: { ...sqlResultSet, sessionId: null },
        }),
        null,
    );
});

test('derives a semantic Artifact title from SQL instead of exposing the statement', () => {
    assert.equal(formatSqlResultTitle('SELECT * FROM production_logs'), 'Production Logs — *');
    assert.equal(formatSqlResultTitle('SELECT count(*) AS order_count FROM orders'), 'Orders — order count');
    assert.notEqual(
        formatSqlResultTitle('SELECT country, COUNT(*) AS user_count FROM users GROUP BY country'),
        formatSqlResultTitle('SELECT substr(created_at, 1, 7) AS signup_month, COUNT(*) AS user_count FROM users GROUP BY signup_month'),
    );
});

test('builds an Artifact-only workspace URL without source session parameters', () => {
    assert.equal(buildArtifactWorkspacePath('team one', 'artifact/1', 'connection 1'), '/team%20one/artifacts/artifact%2F1/workspace/connection%201');
});

test('reuses a recovery tab already bound to the Artifact session', () => {
    const target: SqlWorkspaceInitialResultTarget = {
        tabId: 'deleted-source-tab',
        sessionId: 'session-1',
        setIndex: 2,
        sql: 'select * from orders',
        title: 'Orders',
    };
    const tabs = [
        {
            tabId: 'recovery-tab',
            tabType: 'sql' as const,
            tabName: 'Orders',
            content: 'select * from orders',
            userId: 'user-1',
            connectionId: 'conn-1',
        },
    ];

    assert.equal(resolveInitialResultTargetTabId(tabs, { 'recovery-tab': 'session-1' }, target), 'recovery-tab');
    assert.equal(resolveInitialResultTargetTabId(tabs, {}, target), null);
});
