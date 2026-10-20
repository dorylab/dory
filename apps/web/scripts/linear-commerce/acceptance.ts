import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import type { loadLinearCommerceFixtures } from './fixtures';

export type LinearCommerceSource = {
    id: string;
    connectorId: string | null;
    connectorProvider: string | null;
    remotePath: string | null;
    sourceUrl: string | null;
    fileName: string;
    format: string;
    contentText: string;
};
export const LINEAR_COMMERCE_UPDATE_MARKER = 'DORY_LINEAR_COMMERCE_UPDATED_V2';
export const LINEAR_COMMERCE_UPDATED_TITLE = '电商指标口径（已更新）.md';
export const LINEAR_COMMERCE_TEMP_TITLE = '临时生命周期测试.md';
export const LINEAR_COMMERCE_TEMP_MARKER = 'DORY_LINEAR_COMMERCE_TEMP_V1';
export const LINEAR_COMMERCE_PHASES = ['baseline', 'updated', 'temporary', 'empty', 'deleted', 'revoked', 'recovered'] as const;
export type LinearCommercePhase = (typeof LINEAR_COMMERCE_PHASES)[number];

// Linear may normalize Markdown list markers, separator spacing and line endings.
function normalizeLine(value: string) {
    return value
        .trim()
        .replace(/^[-*]\s+/, '')
        .replace(/\s+/g, '');
}
export function assertCompleteFixture(actual: string, expected: string, label: string) {
    const normalized = actual.split(/\r?\n/).map(normalizeLine).join('\n');
    for (const line of expected.split(/\r?\n/).filter(line => line.trim() && !/^\s*\|?[\s|:-]+\|\s*$/.test(line))) {
        assert.ok(normalized.includes(normalizeLine(line)), `${label}: missing fixture content`);
    }
}

export function verifyLinearCommerceSources(input: {
    sources: LinearCommerceSource[];
    connectorId: string;
    projectId: string;
    fixtures: Awaited<ReturnType<typeof loadLinearCommerceFixtures>>;
    phase: LinearCommercePhase;
    baselineIds?: Record<string, string>;
    temporaryRemotePath?: string;
}) {
    const owned = input.sources.filter(source => source.connectorId === input.connectorId);
    const lifecycle = input.phase === 'temporary' || input.phase === 'empty';
    assert.equal(owned.length, lifecycle ? 5 : 4, 'Unexpected Linear source count');
    assert.equal(new Set(owned.map(source => source.remotePath)).size, owned.length, 'Duplicate remote source identity');
    for (const source of owned) {
        assert.equal(source.connectorProvider, 'linear');
        assert.equal(source.format, 'markdown'); // Native Linear documents, including plain-text content.
        assert.ok(source.sourceUrl && new URL(source.sourceUrl).hostname === 'linear.app', 'Missing Linear original URL');
    }
    const project = owned.find(source => source.remotePath === `project/${input.projectId}.md`);
    assert.ok(project, 'Missing selected project description');
    assertCompleteFixture(project.contentText, input.fixtures.projectContent, 'Project');
    assert.ok(project.contentText.includes(input.fixtures.projectDescription), 'Missing project short description');
    for (const spec of input.fixtures.documents) {
        const source = owned.find(source => source.remotePath?.startsWith('document/') && source.contentText.includes(spec.marker));
        assert.ok(source, `Missing document ${spec.fileName}`);
        assertCompleteFixture(source.contentText, spec.content, spec.fileName);
        assert.ok(source.contentText.includes(spec.answer), `Missing answer in ${spec.fileName}`);
        if (spec.fileName === '电商指标口径.md' && input.phase === 'updated') {
            assert.ok(source.fileName.startsWith(LINEAR_COMMERCE_UPDATED_TITLE));
            assert.ok(source.contentText.includes(LINEAR_COMMERCE_UPDATE_MARKER));
        }
    }
    if (input.phase === 'temporary')
        assert.ok(
            owned.some(source => source.contentText.includes(LINEAR_COMMERCE_TEMP_MARKER)),
            'Missing temporary document',
        );
    if (input.phase === 'empty') {
        assert.ok(input.temporaryRemotePath, 'Run the temporary phase before empty');
        const temporary = owned.find(source => source.remotePath === input.temporaryRemotePath);
        assert.ok(temporary, 'Empty document must retain its source identity');
        assert.ok(temporary.fileName.startsWith(LINEAR_COMMERCE_TEMP_TITLE));
        assert.ok(!temporary.contentText.includes(LINEAR_COMMERCE_TEMP_MARKER));
        assert.ok(temporary.contentText.includes(temporary.sourceUrl!));
    }
    if (input.phase === 'deleted') {
        assert.ok(input.temporaryRemotePath, 'Run the temporary phase before deleted');
        assert.ok(!owned.some(source => source.remotePath === input.temporaryRemotePath), 'Deleted document was not removed');
    }
    if (input.baselineIds)
        for (const [remotePath, id] of Object.entries(input.baselineIds)) {
            assert.equal(owned.find(source => source.remotePath === remotePath)?.id, id, 'Source identity changed after sync');
        }
    // Whitelist evidence fields: no credential objects, request headers, keys or source bodies.
    return {
        sourceIdsByRemotePath: Object.fromEntries(owned.map(source => [source.remotePath!, source.id])),
        sources: owned.map(source => ({
            id: source.id,
            remotePath: source.remotePath,
            sourceUrl: source.sourceUrl,
            title: source.fileName,
            contentSha256: createHash('sha256').update(source.contentText).digest('hex'),
        })),
    };
}
