import { createSerializer, parseAsString } from 'nuqs';

export const generationTaskParser = parseAsString;
export const documentTasksKey = (organizationId: string) => ['document-generation-tasks', organizationId] as const;
export const documentTaskKey = (organizationId: string, id: string) => ['document-generation-task', organizationId, id] as const;
const serializeTask = createSerializer({ generationTask: generationTaskParser, tab: parseAsString, file: parseAsString, folder: parseAsString });
export function documentTaskHref(organizationId: string, knowledgeModelId: string, values: { generationTask?: string; file?: string; folder?: string }) {
    return serializeTask('/' + encodeURIComponent(organizationId) + '/knowledge/' + encodeURIComponent(knowledgeModelId), { tab: 'documents', ...values });
}
