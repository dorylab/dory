import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import type { DBService } from '@dory/database';
import type { KnowledgeConnectorSnapshot } from '@dory/database/postgres/impl/knowledge';
import { isDesktopRuntime } from '@dory/shared/runtime';
import { decrypt, encrypt } from '@dory/web-utils/crypto';
import { z } from 'zod';

const callbackPath = '/api/knowledge/connectors/drive/callback';
const scope = 'https://www.googleapis.com/auth/drive.readonly';
const folderMime = 'application/vnd.google-apps.folder';
const docMime = 'application/vnd.google-apps.document';
const fileId = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const metadata = z.object({ id: fileId, name: z.string(), mimeType: z.string(), trashed: z.boolean().optional(), size: z.string().optional() });
const pageSchema = z.object({ files: z.array(metadata), nextPageToken: z.string().optional(), incompleteSearch: z.boolean().optional() });

function config() {
    const desktop = isDesktopRuntime();
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = desktop ? `http://127.0.0.1:${process.env.PORT || 3000}${callbackPath}` : process.env.GOOGLE_DRIVE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri || Buffer.from(process.env.DS_SECRET_KEY || '', 'base64').length !== 32)
        throw new Error('Configure Google Drive OAuth and a persistent DS_SECRET_KEY on this deployment.');
    return { clientId, clientSecret, redirectUri };
}

type DriveScope = { organizationId: string; knowledgeModelId: string; userId: string };

export async function beginDriveAuthorization(db: Pick<DBService, 'knowledge'>, owner: DriveScope) {
    const { clientId, redirectUri } = config();
    const id = randomBytes(32).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    await db.knowledge.beginDriveAuthorization({ ...owner, id, state, verifier, expiresAt: new Date(Date.now() + 15 * 60_000) });
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
        scope,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    });
    return { id, url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params };
}

export class DriveGrantRevoked extends Error {}

async function exchange(params: Record<string, string>) {
    const { clientId, clientSecret } = config();
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        const problem = await response.json().catch(() => null);
        if (params.grant_type === 'refresh_token' && problem?.error === 'invalid_grant')
            throw new DriveGrantRevoked('Google access has expired or been revoked. Reauthorize this connection.');
        throw new Error('Google authorization failed. Check the account grant and OAuth configuration.');
    }
    return z.object({ access_token: z.string(), refresh_token: z.string().optional() }).parse(await response.json());
}

export async function finishDriveAuthorization(db: Pick<DBService, 'knowledge'>, state: string, code: string | null) {
    const session = await db.knowledge.claimDriveCallback(state);
    try {
        if (!code) throw new Error('Google authorization was cancelled.');
        const tokens = await exchange({ grant_type: 'authorization_code', code, code_verifier: session.verifier, redirect_uri: config().redirectUri });
        if (!tokens.refresh_token) throw new Error('Google did not grant offline access. Reauthorize the account.');
        await db.knowledge.finishDriveCallback(session.id, await encrypt(tokens.refresh_token));
    } catch (error) {
        await db.knowledge.finishDriveCallback(session.id, null);
        throw error;
    }
}

export async function driveAccess(encrypted: string) {
    return (await exchange({ grant_type: 'refresh_token', refresh_token: await decrypt(encrypted) })).access_token;
}

async function driveFetch(token: string, path: string, params: Record<string, string>) {
    const response = await fetch('https://www.googleapis.com/drive/v3/files' + path + '?' + new URLSearchParams(params), {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
        signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}). Check access to the selected folder.`);
    return response;
}

export async function getDriveFolder(token: string, id: string) {
    const result = metadata.parse(await (await driveFetch(token, '/' + fileId.parse(id), { fields: 'id,name,mimeType,trashed', supportsAllDrives: 'true' })).json());
    if (result.trashed || result.mimeType !== folderMime) throw new Error('The selected Google Drive folder is unavailable.');
    return result;
}

async function* children(token: string, parent: string, onlyFolders = false) {
    let cursor = '';
    const seen = new Set<string>();
    do {
        if (seen.has(cursor)) throw new Error('Google Drive returned an incomplete listing.');
        seen.add(cursor);
        const q = `'${fileId.parse(parent)}' in parents and trashed = false` + (onlyFolders ? ` and mimeType = '${folderMime}'` : '');
        const response = await driveFetch(token, '', {
            q,
            pageSize: '1000',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true',
            fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,size)',
            ...(cursor ? { pageToken: cursor } : {}),
        });
        const result = pageSchema.parse(await response.json());
        if (result.incompleteSearch) throw new Error('Google Drive returned an incomplete listing.');
        yield* result.files;
        cursor = result.nextPageToken ?? '';
    } while (cursor);
}

export async function listDriveFolders(token: string, parent: string) {
    const folders = [];
    for await (const { id, name } of children(token, parent, true)) folders.push({ id, name });
    return folders.sort((a, b) => a.name.localeCompare(b.name));
}

async function readMarkdown(response: Response, remainingBytes: number) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Google Drive returned an incomplete document.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > remainingBytes || size > 10_000_000) {
                await reader.cancel();
                throw new Error('Google Drive folder exceeds the sync limit.');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return { contentText: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), size };
}

export async function readDriveSnapshot(encrypted: string, folderId: string): Promise<KnowledgeConnectorSnapshot> {
    const token = await driveAccess(encrypted);
    const root = await getDriveFolder(token, folderId);
    const queue: { id: string; trail: { id: string; name: string }[] }[] = [{ id: root.id, trail: [] }];
    const seen = new Set<string>();
    const files: KnowledgeConnectorSnapshot['files'] = [];
    const folders: NonNullable<KnowledgeConnectorSnapshot['folders']> = [];
    let total = 0;
    for (const folder of queue) {
        if (seen.has(folder.id)) throw new Error('Google Drive folder listing changed. Retry synchronization.');
        seen.add(folder.id);
        for await (const item of children(token, folder.id)) {
            if (item.mimeType === folderMime) {
                if (folders.length >= 10000) throw new Error('Folder exceeds the 10,000 directory limit.');
                folders.push({ id: item.id, name: item.name, parent: folder.id === root.id ? '' : folder.id });
                queue.push({ id: item.id, trail: [...folder.trail, { id: item.id, name: item.name }] });
                continue;
            }
            const doc = item.mimeType === docMime;
            if (!doc && (item.mimeType.startsWith('application/vnd.google-apps.') || !(/\.(md|markdown)$/i.test(item.name) || item.mimeType === 'text/markdown'))) continue;
            if (Number(item.size) > 10_000_000 || files.length >= 5000) throw new Error('Google Drive folder exceeds the sync limit.');
            const response = doc
                ? await driveFetch(token, '/' + item.id + '/export', { mimeType: 'text/markdown' })
                : await driveFetch(token, '/' + item.id, { alt: 'media', supportsAllDrives: 'true' });
            const { contentText, size } = await readMarkdown(response, 50_000_000 - total);
            total += size;
            files.push({
                path: item.id,
                title: item.name,
                format: 'markdown',
                contentText,
                sha: createHash('sha256').update(contentText).digest('hex'),
                folderTrail: folder.trail,
                sourceUrl: doc ? 'https://docs.google.com/document/d/' + item.id + '/edit' : 'https://drive.google.com/open?id=' + item.id,
            });
        }
    }
    return { files, folders, rootName: root.name };
}
