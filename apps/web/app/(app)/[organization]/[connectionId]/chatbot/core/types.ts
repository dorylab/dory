export type ChatMode = 'global' | 'copilot'; 


export type ChatSessionType = 'global' | 'copilot';

export type ChatSessionItem = {
  id: string;
  title?: string | null;
  type: ChatSessionType; 
  createdAt: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  archivedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};
export const DEFAULT_TITLE = 'Untitled session';
