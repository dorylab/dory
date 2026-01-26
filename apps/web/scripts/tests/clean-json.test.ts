import assert from 'node:assert/strict';
import { cleanJson } from '../../lib/ai/core/clean-json';

const input = `{
  "summary": "demo",
  "highlights": [
    {"field": "a", "description": "first"}
    {"field": "b", "description": "second"}
  ]
}`;

const cleaned = cleanJson(input);
const parsed = JSON.parse(cleaned);

assert.equal(parsed.summary, 'demo');
assert.equal(parsed.highlights.length, 2);
