export type ChatChartTextPart = { type: 'text'; text: string } | { type: 'chart'; chartId: string };

export function chatChartEmbed(toolCallId: string): string {
    return `![Chart](dory://chart/${encodeURIComponent(toolCallId)})`;
}

/** Resolve only charts returned in this message; Markdown never supplies chart data. */
export function buildChatChartLayout(chartIds: string[], texts: { id: string; text: string }[], fallbackTextId?: string) {
    const available = new Set(chartIds);
    const placed = new Set<string>();
    const layouts = new Map<string, ChatChartTextPart[]>();
    for (const { id, text } of texts) {
        const parts: ChatChartTextPart[] = [];
        let prose = '';
        let fence: { character: string; length: number } | undefined;
        const flush = () => {
            if (prose.trim()) parts.push({ type: 'text', text: prose });
            prose = '';
        };
        for (const line of text.split('\n')) {
            const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
            if (delimiter) {
                if (!fence) fence = { character: delimiter[1][0], length: delimiter[1].length };
                else if (delimiter[1][0] === fence.character && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
                prose += `${line}\n`;
                continue;
            }
            const embed = !fence && line.match(/^ {0,3}!\[[^\]]*\]\(dory:\/\/chart\/([^\s)]+)\)[ \t]*$/);
            if (!embed) {
                prose += `${line}\n`;
                continue;
            }
            let chartId: string;
            try {
                chartId = decodeURIComponent(embed[1]);
            } catch {
                continue;
            }
            if (!available.has(chartId) || placed.has(chartId)) continue;
            flush();
            parts.push({ type: 'chart', chartId });
            placed.add(chartId);
        }
        flush();
        layouts.set(id, parts);
    }
    // Older answers have no embed markers. Keep their charts with the answer,
    // after its prose, instead of ahead of it at the tool invocation position.
    const fallback = fallbackTextId ? layouts.get(fallbackTextId) : undefined;
    if (fallback) {
        for (const chartId of available) {
            if (placed.has(chartId)) continue;
            fallback.push({ type: 'chart', chartId });
            placed.add(chartId);
        }
    }
    return { layouts, placed };
}
