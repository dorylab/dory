export type KnowledgeDefinitionStatus = 'verified' | 'unverified' | 'auto_published';

/** Publication is distinct from human verification. Ordinary drafts remain private. */
export const isPublishedDefinition = (definition: { status: string }) => definition.status === 'verified' || definition.status === 'auto_published';
