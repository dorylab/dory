import type { QueryClient } from '@tanstack/react-query';

export async function refreshQueryLibraries(client: QueryClient) {
    window.dispatchEvent(new CustomEvent('saved-queries-updated'));
    await Promise.all(
        [
            'knowledge-model',
            'knowledge-models',
            'knowledge-model-options',
            'knowledge-directory-search',
            'knowledge-connection-queries',
            'knowledge-query-options',
            'saved-query-memberships',
        ].map(key => client.invalidateQueries({ queryKey: [key] })),
    );
}
