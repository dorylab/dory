import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { KNOWLEDGE_SOURCE_MAX_BYTES } from '@dory/database/postgres/impl/knowledge';

export class LinearApiError extends Error {
    constructor(
        message: string,
        public readonly retryable = false,
        public readonly retryAt?: Date,
        public readonly unauthorized = false,
    ) {
        super(message);
    }
}

export type LinearClientOptions = { fetch?: typeof fetch };
const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const projectFields = 'id name description content url';
const projectSchema = z.object({ id: z.string(), name: z.string(), description: z.string(), content: z.string().nullable(), url: z.string().url() });
const documentSchema = z.object({ id: z.string(), title: z.string(), content: z.string().nullable(), url: z.string().url(), trashed: z.boolean().nullable() });
export type LinearProject = z.infer<typeof projectSchema>;

export async function linearGraphQL<T>(token: string, query: string, variables: Record<string, unknown>, schema: z.ZodType<T>, options: LinearClientOptions = {}): Promise<T> {
    let response: Response;
    try {
        response = await (options.fetch ?? fetch)('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
        });
    } catch {
        throw new LinearApiError('Linear request timed out or could not connect.', true);
    }
    const body: unknown = await response.json().catch(() => null);
    const envelope = z
        .object({ errors: z.array(z.object({ extensions: z.object({ code: z.string().optional() }).passthrough().optional() })).optional() })
        .passthrough()
        .safeParse(body);
    const codes = envelope.success ? (envelope.data.errors?.map(error => error.extensions?.code) ?? []) : [];
    if (response.status === 401 || codes.includes('UNAUTHENTICATED') || codes.includes('AUTHENTICATION_ERROR')) {
        throw new LinearApiError('Linear API Key is invalid. Update the API Key.', false, undefined, true);
    }
    const limited = response.status === 429 || codes.includes('RATELIMITED');
    if (limited || response.status >= 500) {
        const reset = Number(response.headers.get('x-ratelimit-requests-reset'));
        const retry = response.headers.get('retry-after');
        const retryMs = retry ? (Number.isFinite(Number(retry)) ? Date.now() + Number(retry) * 1000 : Date.parse(retry)) : reset;
        throw new LinearApiError(
            limited ? 'Linear rate limit reached; synchronization will retry.' : 'Linear is temporarily unavailable.',
            true,
            Number.isFinite(retryMs) && retryMs > Date.now() ? new Date(retryMs) : undefined,
        );
    }
    // GraphQL can return both data and errors. Never commit a partial snapshot.
    if (!response.ok || !envelope.success || envelope.data.errors?.length)
        throw new LinearApiError(`Linear API request failed (${response.status}). No knowledge content was changed.`);
    const result = z.object({ data: schema }).safeParse(body);
    if (!result.success) throw new LinearApiError('Linear returned incomplete or unsupported data. No knowledge content was changed.');
    return result.data.data;
}

export async function listLinearProjects(token: string, input: { after?: string; search?: string }, options?: LinearClientOptions) {
    const result = await linearGraphQL(
        token,
        `query DoryProjects($after: String, $filter: ProjectFilter) {
        projects(first: 50, after: $after, includeArchived: true, filter: $filter) { nodes { id name url } pageInfo { hasNextPage endCursor } }
    }`,
        { after: input.after, filter: input.search ? { name: { containsIgnoreCase: input.search } } : undefined },
        z.object({ projects: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), url: z.string().url() })), pageInfo }) }),
        options,
    );
    return result.projects;
}

export async function readLinearWorkspace(token: string, options?: LinearClientOptions) {
    const result = await linearGraphQL(
        token,
        'query DoryWorkspace { organization { id name } }',
        {},
        z.object({ organization: z.object({ id: z.string(), name: z.string() }) }),
        options,
    );
    return result.organization;
}

function sourceItem(kind: 'project' | 'document', id: string, title: string, contentText: string, sourceUrl: string) {
    if (Buffer.byteLength(contentText, 'utf8') > KNOWLEDGE_SOURCE_MAX_BYTES) throw new LinearApiError(`Linear ${kind} exceeds the 10 MB knowledge-source limit.`);
    return {
        path: `${kind}/${id}.md`,
        format: 'markdown' as const,
        title,
        contentText,
        sourceUrl,
        sha: createHash('sha256').update(contentText).update(title).update(sourceUrl).digest('hex'),
    };
}

export async function readLinearConnectorSnapshot(token: string, projectIds: string[], options?: LinearClientOptions) {
    const files: ReturnType<typeof sourceItem>[] = [];
    for (const projectId of [...new Set(projectIds)]) {
        const { project } = await linearGraphQL(
            token,
            `query DoryProject($id: String!) { project(id: $id) { ${projectFields} } }`,
            { id: projectId },
            z.object({ project: projectSchema.nullable() }),
            options,
        );
        if (!project) throw new LinearApiError('A selected Linear project is unavailable. Check access or change the project selection.');
        files.push(
            sourceItem('project', project.id, project.name, `# ${project.name}\n\nSource: ${project.url}\n\n${project.description}\n\n${project.content ?? ''}`, project.url),
        );
        let after: string | undefined;
        const cursors = new Set<string>();
        do {
            const result = await linearGraphQL(
                token,
                `query DoryProjectDocuments($id: String!, $after: String) {
                project(id: $id) { documents(first: 50, after: $after, includeArchived: true) { nodes { id title content url trashed } pageInfo { hasNextPage endCursor } } }
            }`,
                { id: projectId, after },
                z.object({ project: z.object({ documents: z.object({ nodes: z.array(documentSchema), pageInfo }) }).nullable() }),
                options,
            );
            if (!result.project) throw new LinearApiError('A selected Linear project became unavailable during synchronization.');
            for (const document of result.project.documents.nodes) {
                if (document.trashed) continue;
                files.push(
                    sourceItem(
                        'document',
                        document.id,
                        document.title,
                        `# ${document.title}\n\nProject: ${project.name}\n\nSource: ${document.url}\n\n${document.content ?? ''}`,
                        document.url,
                    ),
                );
            }
            const page = result.project.documents.pageInfo;
            if (!page.hasNextPage) break;
            if (!page.endCursor || cursors.has(page.endCursor)) throw new LinearApiError('Linear returned an invalid pagination cursor.');
            cursors.add(page.endCursor);
            after = page.endCursor;
        } while (true);
    }
    // A document moved between two selected projects while paging must not create duplicate sources.
    return { files: [...new Map(files.map(file => [file.path, file])).values()] };
}

export async function validateLinearProjectIds(token: string, projectIds: string[], options?: LinearClientOptions) {
    for (let offset = 0; offset < projectIds.length; offset += 10) {
        const ids = projectIds.slice(offset, offset + 10);
        const declarations = ids.map((_, i) => `$id${i}: String!`).join(', ');
        const fields = ids.map((_, i) => `p${i}: project(id: $id${i}) { id }`).join('\n');
        const variables = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
        const shape = Object.fromEntries(ids.map((_, i) => [`p${i}`, z.object({ id: z.string() }).nullable()]));
        const data = await linearGraphQL(token, `query DoryValidateProjects(${declarations}) { ${fields} }`, variables, z.object(shape), options);
        if (Object.values(data).some(project => !project)) throw new LinearApiError('One or more selected Linear projects are unavailable.');
    }
}
