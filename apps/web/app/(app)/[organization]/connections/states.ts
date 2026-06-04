import { atom } from 'jotai';
import { ConnectionListItem } from '@dory/shared/types/connections';
import type { ConnectionEnvironmentValue, ConnectionTagColorValue } from './constants';

export const connectionsAtom = atom<ConnectionListItem[]>([]);

export const searchResultAtom = atom<ConnectionListItem[] | null>(null);
export const connectionSearchQueryAtom = atom('');
export const connectionEnvironmentFilterAtom = atom<ConnectionEnvironmentValue[]>([]);
export const connectionTagFilterAtom = atom<ConnectionTagColorValue[]>([]);
export const connectionStatusAtom = atom<'New' | 'Edit'>('New');
export const connectionOpenAtom = atom(false);
export const connectionDeleteAtom = atom(false);

export const connectionLoadingAtom = atom<any>({});
export const connectionListLoadingAtom = atom<boolean>(true);
export const connectionLoadingMessageAtom = atom<string | null>(null);
export const connectionSwitchingAtom = atom<{ connectionId: string; startedAt: number } | null>(null);
export const connectionErrorAtom = atom<string | null>(null);
export const connectionsErrorAtom = atom<any>({});
