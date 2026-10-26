/** Server-issued provenance. Never accept this object from a model or browser. */
export type ChatAttachmentSource = {
    chatId: string;
    userId: string;
    files: Array<{ attachmentId: string; filename: string; sha256: string; table: string; sheet?: string }>;
};
export function canReadAttachmentSource(source: ChatAttachmentSource | null | undefined, userId?: string, chatId?: string | null) {
    return !source || (source.userId === userId && (chatId === undefined || source.chatId === chatId));
}
