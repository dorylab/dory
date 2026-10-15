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
