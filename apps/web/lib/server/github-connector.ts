import 'server-only';

import { parseDocument } from 'yaml';

import { KNOWLEDGE_SOURCE_MAX_BYTES } from '@dory/database/postgres/impl/knowledge';
import type { KnowledgeConnector } from '@dory/database/postgres/schemas';
import { installationToken } from './github-app';

const API = 'https://api.github.com';
const ACCEPT = 'application/vnd.github+json';

export type GitHubRepository = { id: string; fullName: string; defaultBranch: string; private: boolean };
type GitTreeItem = { path: string; mode: string; type: 'blob' | 'tree'; sha: string; size?: number };
export type GitHubClientOptions = { fetch?: typeof fetch; tokenProvider?: (installationId: string) => Promise<{ token: string }> };

async function githubFetch<T>(installationId: string, path: string, options: GitHubClientOptions = {}): Promise<T> {
    const { token } = await (options.tokenProvider ?? installationToken)(installationId);
    const response = await (options.fetch ?? fetch)(`${API}${path}`, {
        headers: { Accept: ACCEPT, Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`GitHub API request failed (${response.status}).`);
    return (await response.json()) as T;
}

export async function listGitHubRepositories(installationId: string, options?: GitHubClientOptions): Promise<GitHubRepository[]> {
    const result: GitHubRepository[] = [];
    for (let page = 1; page <= 10; page += 1) {
        const response = await githubFetch<{ repositories: Array<{ id: number; full_name: string; default_branch: string; private: boolean }> }>(
            installationId,
            `/installation/repositories?per_page=100&page=${page}`,
            options,
        );
        result.push(...response.repositories.map(repo => ({ id: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private })));
        if (response.repositories.length < 100) break;
    }
    return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function repositoryTree(installationId: string, repositoryFullName: string, branch: string, options?: GitHubClientOptions) {
    const repoPath = repositoryFullName
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    const tree = await githubFetch<{ sha: string; truncated: boolean; tree: GitTreeItem[] }>(
        installationId,
        `/repos/${repoPath}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        options,
    );
    if (tree.truncated) throw new Error('This repository is too large to browse recursively. Choose a smaller repository.');
    return tree;
}

export async function listGitHubDirectories(installationId: string, repositoryFullName: string, branch: string, options?: GitHubClientOptions) {
    const tree = await repositoryTree(installationId, repositoryFullName, branch, options);
    const directories = new Set<string>(['']);
    for (const item of tree.tree) {
        if (item.type === 'tree') directories.add(item.path);
        if (item.type === 'blob' && supportedPath(item.path)) {
            const parts = item.path.split('/');
            parts.pop();
            while (parts.length) {
                directories.add(parts.join('/'));
                parts.pop();
            }
        }
    }
    return [...directories].sort((a, b) => a.localeCompare(b));
}

function supportedPath(path: string) {
    return /\.(?:md|markdown|ya?ml|txt)$/i.test(path);
}

export async function readGitHubConnectorSnapshot(connector: KnowledgeConnector, options?: GitHubClientOptions) {
    const tree = await repositoryTree(connector.installationId, connector.repositoryFullName, connector.defaultBranch, options);
    const prefix = connector.rootPath ? `${connector.rootPath.replace(/\/+$/g, '')}/` : '';
    const blobs = tree.tree.filter(item => item.type === 'blob' && item.path.startsWith(prefix) && supportedPath(item.path));
    const tooLarge = blobs.find(item => (item.size ?? 0) > KNOWLEDGE_SOURCE_MAX_BYTES);
    if (tooLarge) throw new Error(`${tooLarge.path} exceeds the 10 MB knowledge-source limit.`);
    const repoPath = connector.repositoryFullName
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    const files = await Promise.all(
        blobs.map(async blob => {
            const result = await githubFetch<{ content: string; encoding: string }>(
                connector.installationId,
                `/repos/${repoPath}/git/blobs/${encodeURIComponent(blob.sha)}`,
                options,
            );
            if (result.encoding !== 'base64') throw new Error(`GitHub returned an unsupported encoding for ${blob.path}.`);
            const bytes = Buffer.from(result.content.replace(/\s/g, ''), 'base64');
            if (bytes.byteLength > KNOWLEDGE_SOURCE_MAX_BYTES) throw new Error(`${blob.path} exceeds the 10 MB knowledge-source limit.`);
            const contentText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            if (/\.ya?ml$/i.test(blob.path)) {
                const document = parseDocument(contentText);
                if (document.errors.length) throw new Error(`${blob.path}: ${document.errors[0]?.message ?? 'Invalid YAML.'}`);
            }
            return { path: blob.path, sha: blob.sha, contentText };
        }),
    );
    return { commitSha: tree.sha, files };
}
