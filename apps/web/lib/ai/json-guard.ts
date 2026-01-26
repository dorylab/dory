// ai/json-guard.ts
export function extractJsonString(raw: string): string {
    const s = raw.trim();

    // 1) Already JSON
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        return s;
    }

    // 2) Extract first JSON object/array from text (models sometimes add extra text)
    const objStart = s.indexOf('{');
    const arrStart = s.indexOf('[');
    const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
    if (start === -1) return s; // Let caller handle error

    // Naive approach: find the last } or ] after start
    const lastObj = s.lastIndexOf('}');
    const lastArr = s.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);

    if (end > start) return s.slice(start, end + 1).trim();
    return s;
}

export function safeParseJson<T = unknown>(raw: string): T {
    const jsonStr = extractJsonString(raw);
    return JSON.parse(jsonStr) as T;
}
