import { randomUUID } from 'node:crypto';
import { joinObjectPath, readableToBuffer, type ObjectStore } from './object-store';

export type ChatAttachmentOwner = { organizationId: string; userId: string };
export type ChatAttachmentManifest = ChatAttachmentOwner & {
    id: string;
    filename: string;
    mediaType: string;
    byteSize: number;
    chatId: string | null;
    createdAt: string;
};

/** Private objects. Only the authenticated chat service may expose their bytes. */
export class ChatAttachmentStore {
    constructor(
        private readonly store: ObjectStore,
        private readonly prefix = '',
    ) {}
    private key(owner: ChatAttachmentOwner, id: string) {
        if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid attachment ID.');
        return joinObjectPath(this.prefix, 'chat-attachments', Buffer.from(owner.organizationId).toString('base64url'), Buffer.from(owner.userId).toString('base64url'), id);
    }
    async put(owner: ChatAttachmentOwner, input: { filename: string; mediaType: string; chatId: string | null; bytes: Uint8Array }) {
        const id = randomUUID();
        const manifest: ChatAttachmentManifest = {
            ...owner,
            id,
            filename: input.filename,
            mediaType: input.mediaType,
            chatId: input.chatId,
            byteSize: input.bytes.byteLength,
            createdAt: new Date().toISOString(),
        };
        const key = this.key(owner, id);
        await this.store.put(`${key}/content`, input.bytes, { contentType: input.mediaType });
        try {
            await this.store.put(`${key}/manifest.json`, JSON.stringify(manifest), { contentType: 'application/json' });
        } catch (error) {
            await this.store.deletePrefix(key);
            throw error;
        }
        return manifest;
    }
    async discardDraft(owner: ChatAttachmentOwner, id: string) {
        const manifest = await this.readManifest(owner, id);
        if (manifest.chatId) return false;
        await this.store.deletePrefix(this.key(owner, id));
        return true;
    }
    async bind(owner: ChatAttachmentOwner, id: string, chatId: string) {
        const manifest = await this.readManifest(owner, id);
        if (manifest.chatId && manifest.chatId !== chatId) throw new Error('Attachment belongs to another conversation.');
        if (manifest.chatId === chatId) return;
        await this.store.put(`${this.key(owner, id)}/manifest.json`, JSON.stringify({ ...manifest, chatId }), { contentType: 'application/json' });
    }
    private async readManifest(owner: ChatAttachmentOwner, id: string) {
        const key = this.key(owner, id);
        if (!(await this.store.exists(`${key}/manifest.json`))) throw new Error('Attachment unavailable.');
        const manifest = JSON.parse((await readableToBuffer(await this.store.get(`${key}/manifest.json`))).toString('utf8')) as ChatAttachmentManifest;
        if (manifest.organizationId !== owner.organizationId || manifest.userId !== owner.userId) throw new Error('Attachment unavailable.');
        return manifest;
    }
    async get(owner: ChatAttachmentOwner, id: string) {
        const manifest = await this.readManifest(owner, id);
        return { manifest, bytes: await readableToBuffer(await this.store.get(`${this.key(owner, id)}/content`)) };
    }
}
