import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { QWEN_MODEL_PRESETS } from '@/lib/ai/model/presets/qwen';

test('Work text output allows analysis explanations while task-specific title rules remain explicit', () => {
    const chat = compileSystemPrompt(QWEN_MODEL_PRESETS.chat.system);
    assert.match(chat!, /include explanations appropriate to the task/);
    assert.doesNotMatch(chat!, /no explanations/i);
    assert.match(compileSystemPrompt(QWEN_MODEL_PRESETS.title.system)!, /Return a concise title only/);
});

test('structured output keeps strict JSON constraints', () => {
    assert.match(compileSystemPrompt({ output: { kind: 'json', strict: true } })!, /JSON string only/);
    assert.match(compileSystemPrompt({ output: { kind: 'json', strict: true } })!, /strict JSON parseable/);
});
