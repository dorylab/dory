import assert from 'node:assert/strict';
import { cleanJson } from '../../lib/ai/core/clean-json';

const canonicalInput = `{
  "summary": "demo",
  "highlights": [
    {"field": "a", "description": "first"}
    {"field": "b", "description": "second"}
  ]
}`;

const cleanedCanonical = cleanJson(canonicalInput);
const parsedCanonical = JSON.parse(cleanedCanonical);
assert.equal(parsedCanonical.summary, 'demo');
assert.equal(parsedCanonical.highlights.length, 2);

const messyInput = `
Some greeting before the payload.
{
  summary: 'messy demo',
  detail: 'detail with single quotes and summary',
  highlights: [
    { field: 'a', description: "first" }
    { field: 'b', description: "second" }
  ]
}`;

const cleanedMessy = cleanJson(messyInput);
const parsedMessy = JSON.parse(cleanedMessy);
assert.equal(parsedMessy.summary, 'messy demo');
assert.equal(parsedMessy.highlights.length, 2);
