import { atom } from 'jotai';
import { ConnectionListItem } from '@/types/connections';

export const connectionsAtom = atom<ConnectionListItem[]>([]);

export const searchResultAtom = atom<ConnectionListItem[] | null>(null);
export const connectionSearchQueryAtom = atom('');
export const connectionStatusAtom = atom<'New' | 'Edit'>('New');
export const connectionOpenAtom = atom(false);
export const connectionDeleteAtom = atom(false);

export const connectionLoadingAtom = atom<any>({});
export const connectionListLoadingAtom = atom<boolean>(true);
export const connectionLoadingMessageAtom = atom<string | null>(null);
export const connectionErrorAtom = atom<string | null>(null);
export const connectionsErrorAtom = atom<any>({});
