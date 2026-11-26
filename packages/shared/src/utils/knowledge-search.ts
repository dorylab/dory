// CJK questions often have no whitespace. Keep bounded character phrases so
// metadata synonyms embedded in natural questions can still match.
export function knowledgeSearchTokens(value: string) {
    const normalized = value.toLocaleLowerCase().trim();
    const terms = new Set([normalized, ...normalized.split(/[^\p{L}\p{N}_]+/u).filter(term => term.length >= 2)].slice(0, 256));
    if (terms.size >= 256) return [...terms].filter(Boolean);
    for (const match of normalized.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu)) {
        const characters = Array.from(match[0]);
        for (let length = 2; length <= 4; length++) {
            for (let offset = 0; offset + length <= characters.length; offset++) {
                terms.add(characters.slice(offset, offset + length).join(''));
                if (terms.size >= 256) return [...terms].filter(Boolean);
            }
        }
    }
    return [...terms].filter(Boolean);
}

// Exact phrases take precedence. For longer questions, reward phrase
// matches across the title and contents, keeping an offset for the excerpt.
export function matchKnowledge(terms: readonly string[], title: string, content: string) {
    const needle = terms[0];
    if (!needle) return { score: 1, offset: 0 };
    const name = title.toLowerCase();
    const body = content.toLowerCase();
    let score = 0;
    let offset = 0;
    let longest = 0;
    for (const term of terms) {
        const inTitle = name.includes(term);
        const position = body.indexOf(term);
        if (!inTitle && position < 0) continue;
        score += Math.min(term.length, 16) * (inTitle ? 3 : 1);
        if (position >= 0 && term.length > longest) {
            longest = term.length;
            offset = position;
        }
    }
    if (name === needle) score += 1000;
    else if (name.includes(needle)) score += 300;
    else if (body.includes(needle)) score += 100;
    return { score, offset };
}
