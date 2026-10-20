import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from '../../lib/actions/server/types';
const require = createRequire(import.meta.url);
const path = require.resolve('server-only');
require.cache[path] = { id: path, filename: path, loaded: true, exports: {} } as NodeJS.Module;
const { extractionKnowledgeActions } = await import('../../lib/actions/server/domains/knowledge/extraction');
test('ordinary members cannot enable, retry, review, batch approve, or edit extracted knowledge', async () => {
    const context = { access: { role: 'member' }, actor: { type: 'user' }, services: {} } as unknown as ActionContext<WebActionServices>;
    for (const id of [
        'knowledge.setAutoExtraction',
        'knowledge.retryExtraction',
        'knowledge.reviewCandidate',
        'knowledge.approveCandidates',
        'knowledge.updateBusinessRule',
        'knowledge.listCandidates',
        'knowledge.getCandidate',
    ]) {
        const action = extractionKnowledgeActions.find(action => action.id === id)!;
        await assert.rejects(async () => action.handler(context, { knowledgeModelId: 'model' } as never), /owners and administrators/);
    }
});
