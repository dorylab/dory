import { UIMessage } from "ai";

export function normalizeMessage(msg: any): any {
    if (msg.parts) return msg; //Already a new format
    if (msg.content) {
        const content = Array.isArray(msg.content)
            ? msg.content.map((c: any) => (typeof c === 'string' ? { type: 'text', text: c } : { type: 'text', text: c?.text ?? JSON.stringify(c) }))
            : [{ type: 'text', text: String(msg.content) }];

        return { ...msg, parts: content };
    }
    return msg;
}

export function deriveTitle(messages: UIMessage[]) {
    for (const message of messages) {
        if (message.role !== 'user' || !Array.isArray(message.parts)) continue;
        const textParts = message.parts.filter((part: any) => part?.type === 'text' && typeof part.text === 'string');
        if (!textParts.length) continue;

        const combined = textParts
            .map((part: any) => part.text.trim())
            .join(' ')
            .trim();

        if (!combined) continue;
        return combined.length > 60 ? `${combined.slice(0, 60)}…` : combined;
    }
    return null;
}