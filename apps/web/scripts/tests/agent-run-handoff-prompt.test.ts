import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentRunHandoffPrompt } from '@/lib/agent-runs/handoff-prompt';

test('Agent Run handoff prompt includes existing workspace context', () => {
    const prompt = buildAgentRunHandoffPrompt({
        workId: 'work-1',
        connectionId: 'conn-1',
        workspaceUrl: 'https://dory.test/org/agent-runs/work-1/workspace/conn-1',
        title: 'HN analysis',
        connectionName: 'play',
        tabCount: 3,
        sqlExecutionCount: 2,
    });

    assert.match(prompt, /workId "work-1"/);
    assert.match(prompt, /Connection ID: conn-1/);
    assert.match(prompt, /Workspace URL: https:\/\/dory\.test\/org\/agent-runs\/work-1\/workspace\/conn-1/);
    assert.match(prompt, /List workspace tabs first/);
    assert.match(prompt, /dory_workspace_tabs/);
    assert.match(prompt, /summarize only the new work completed in this continuation/);
    assert.match(prompt, /structured Finding with its evidenceArtifactIds/);
    assert.match(prompt, /existing Run summary/);
    assert.match(prompt, /Do not create a new Dory work/);
    assert.doesNotMatch(prompt, /Authorization/i);
    assert.doesNotMatch(prompt, /Bearer/i);
    assert.doesNotMatch(prompt, /token/i);
});

test('Agent Run handoff prompt works with missing optional labels', () => {
    const prompt = buildAgentRunHandoffPrompt({
        workId: 'work-2',
    });

    assert.match(prompt, /Work ID: work-2/);
    assert.match(prompt, /Agent Run/);
    assert.match(prompt, /List workspace tabs first/);
    assert.doesNotMatch(prompt, /Connection ID:/);
});
