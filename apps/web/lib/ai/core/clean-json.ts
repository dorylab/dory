export function cleanJson(text: string) {
    const trimmed = text.trim();
    const withoutFence = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const candidate = withoutFence || trimmed;
    const extracted = extractJsonPayload(candidate);
    return repairJson(extracted);
}

export function uniqueTags(tags: string[]) {
    return Array.from(new Set(tags.filter(Boolean)));
}

function extractJsonPayload(text: string) {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const start =
        firstBrace === -1
            ? firstBracket
            : firstBracket === -1
                ? firstBrace
                : Math.min(firstBrace, firstBracket);
    if (start === -1) return text;

    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (end === -1 || end <= start) return text;

    return text.slice(start, end + 1).trim();
}

function removeTrailingCommas(text: string) {
    return text.replace(/,\s*([}\]])/g, '$1');
}

function repairJson(text: string) {
    let repaired = removeTrailingCommas(text);
    // Insert missing commas between adjacent values/objects/arrays.
    repaired = repaired.replace(/([}\]"])\s*(?=[{\["])/g, '$1,');
    return removeTrailingCommas(repaired);
}
