export function cleanJson(text: string) {
    const trimmed = text.trim();
    const withoutFence = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const candidate = withoutFence || trimmed;
    const extracted = extractJsonPayload(candidate);
    const normalized = normalizeJsonPayload(extracted);
    return repairJson(normalized);
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

function normalizeJsonPayload(text: string) {
    if (!text) return text;
    let normalized = normalizeUnicodeQuotes(text);
    normalized = normalizeFullWidthPunctuation(normalized);
    normalized = normalizeSingleQuotedStrings(normalized);
    normalized = quoteUnquotedKeys(normalized);
    return normalized;
}

function normalizeUnicodeQuotes(text: string) {
    return text
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
}

function normalizeFullWidthPunctuation(text: string) {
    return text.replace(/[：]/g, ':');
}

function normalizeSingleQuotedStrings(text: string) {
    let escaped = false;
    let inSingle = false;
    let inDouble = false;
    let result = '';

    for (const char of text) {
        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            result += char;
            continue;
        }

        if (char === '"' && !inSingle) {
            inDouble = !inDouble;
            result += char;
            continue;
        }

        if (char === "'" && !inDouble) {
            inSingle = !inSingle;
            result += '"';
            continue;
        }

        result += char;
    }

    return result;
}

function quoteUnquotedKeys(text: string) {
    return text.replace(/([{,]\s*)(?!["'])(([A-Za-z0-9_@\-]+))\s*:/g, '$1"$2":');
}
