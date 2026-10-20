import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { LinearApiError, linearGraphQL, listLinearProjects, readLinearConnectorSnapshot, validateLinearProjectIds } from '../../lib/server/linear-client';
import { assertLinearAdmin, linearConfigured, linearRuntimeAvailable } from '../../lib/server/linear-credentials';

const p1 = '11111111-1111-4111-8111-111111111111';
const project = { id: p1, name: 'Data model', description: 'Short summary', content: '# Full specification\nRevenue is net.', url: 'https://linear.app/dory/project/data-model' };
const doc = { id: 'document-1', title: 'Revenue definition', content: 'Exclude refunds.', url: 'https://linear.app/dory/document/revenue', trashed: false };
const last = { hasNextPage: false, endCursor: null };
function mockClient(failSecondPage = false) {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (_input, init) => {
        assert.equal(new Headers(init?.headers).get('authorization'), 'token');
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        if (body.query.includes('DoryProjectDocuments')) {
            if (body.variables.after === 'cursor-1')
                return failSecondPage
                    ? Response.json({ data: { project: null }, errors: [{ extensions: { code: 'FORBIDDEN' } }] })
                    : Response.json({ data: { project: { documents: { nodes: [{ ...doc, id: 'document-2', content: null }], pageInfo: last } } } });
            return Response.json({ data: { project: { documents: { nodes: [doc], pageInfo: { hasNextPage: true, endCursor: 'cursor-1' } } } } });
        }
        if (body.query.includes('DoryProjects')) return Response.json({ data: { projects: { nodes: [project], pageInfo: last } } });
        return Response.json({ data: { project } });
    };
    return { calls, options: { fetch: fetcher } };
}

test('Linear reads the full description and every document page including empty documents and archived resources', async () => {
    const mock = mockClient();
    const snapshot = await readLinearConnectorSnapshot('token', [p1, p1], mock.options);
    assert.equal(snapshot.files.length, 3);
    assert.match(snapshot.files[0].contentText, /Short summary/);
    assert.match(snapshot.files[0].contentText, /Full specification/);
    assert.match(snapshot.files[1].contentText, /Exclude refunds/);
    assert.equal(snapshot.files[1].sourceUrl, doc.url);
    assert.equal(snapshot.files[1].path, 'document/document-1.md');
    assert.ok(mock.calls.filter(call => call.query.includes('Documents')).every(call => call.query.includes('includeArchived: true')));
    assert.equal(mock.calls[2].variables.after, 'cursor-1');
    assert.equal((await readLinearConnectorSnapshot('token', [p1], mock.options)).files[1].sha, snapshot.files[1].sha);
});

test('partial GraphQL errors reject the entire snapshot even when data is present', async () => {
    await assert.rejects(readLinearConnectorSnapshot('token', [p1], mockClient(true).options), /No knowledge content was changed/);
});

test('Linear excludes trashed documents while retaining archived and empty documents', async () => {
    const snapshot = await readLinearConnectorSnapshot('token', [p1], {
        fetch: async (_url, init) => {
            const query = JSON.parse(String(init?.body)).query;
            return Response.json({
                data: {
                    project: query.includes('Documents')
                        ? {
                              documents: {
                                  nodes: [doc, { ...doc, id: 'trashed', trashed: true }, { ...doc, id: 'archived', archivedAt: '2026-10-20', content: null }],
                                  pageInfo: last,
                              },
                          }
                        : project,
                },
            });
        },
    });
    assert.deepEqual(
        snapshot.files.map(file => file.path),
        [`project/${p1}.md`, 'document/document-1.md', 'document/archived.md'],
    );
});

test('Linear project search is server-filtered and passes pagination cursors', async () => {
    const mock = mockClient();
    await listLinearProjects('token', { after: 'previous', search: 'Data' }, mock.options);
    assert.deepEqual(mock.calls[0].variables, { after: 'previous', filter: { name: { containsIgnoreCase: 'Data' } } });
});

test('Linear rejects missing projects, looping pagination and oversized knowledge sources', async () => {
    await assert.rejects(readLinearConnectorSnapshot('token', [p1], { fetch: async () => Response.json({ data: { project: null } }) }), /unavailable/);
    await assert.rejects(
        readLinearConnectorSnapshot('token', [p1], {
            fetch: async (_url, init) => {
                const query = JSON.parse(String(init?.body)).query;
                return Response.json({
                    data: { project: query.includes('Documents') ? { documents: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'same' } } } : project },
                });
            },
        }),
        /pagination/,
    );
    await assert.rejects(
        readLinearConnectorSnapshot('token', [p1], { fetch: async () => Response.json({ data: { project: { ...project, content: 'x'.repeat(10_000_001) } } }) }),
        /10 MB/,
    );
});

test('Linear classifies GraphQL rate limits, HTTP failures, and network errors without exposing response content', async () => {
    for (const fetcher of [
        async () => Response.json({ errors: [{ message: 'secret', extensions: { code: 'RATELIMITED' } }] }, { status: 400 }),
        async () => new Response('secret', { status: 503 }),
        async () => {
            throw new Error('secret');
        },
    ]) {
        await assert.rejects(
            linearGraphQL('token', 'query {}', {}, z.object({}), { fetch: fetcher }),
            error => error instanceof LinearApiError && error.retryable && !error.message.includes('secret'),
        );
    }
});

test('Linear administration and runtime/configuration gates are enforced', () => {
    const previous = process.env.DORY_RUNTIME;
    const secret = process.env.DS_SECRET_KEY;
    try {
        process.env.DORY_RUNTIME = 'web';
        assertLinearAdmin({ access: { role: 'owner' } });
        assert.throws(() => assertLinearAdmin({ access: { role: 'member' } }), /administrators/);
        process.env.DS_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
        for (const runtime of ['desktop', 'docker', 'web']) {
            process.env.DORY_RUNTIME = runtime;
            assert.equal(linearRuntimeAvailable(), true);
            assert.equal(linearConfigured(), true);
            assertLinearAdmin({ access: { role: 'admin' } });
        }
        delete process.env.DS_SECRET_KEY;
        assert.equal(linearConfigured(), false);
        process.env.DORY_RUNTIME = 'headless';
        assert.equal(linearRuntimeAvailable(), false);
        assert.throws(() => assertLinearAdmin({ access: { role: 'admin' } }), /runtime/);
    } finally {
        if (secret === undefined) delete process.env.DS_SECRET_KEY;
        else process.env.DS_SECRET_KEY = secret;
        if (previous === undefined) delete process.env.DORY_RUNTIME;
        else process.env.DORY_RUNTIME = previous;
    }
});

test('project selection validation rejects inaccessible selected projects', async () => {
    await assert.rejects(validateLinearProjectIds('token', [p1], { fetch: async () => Response.json({ data: { p0: null } }) }), /unavailable/);
});
