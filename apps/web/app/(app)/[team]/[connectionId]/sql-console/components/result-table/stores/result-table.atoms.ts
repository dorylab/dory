import { ResultSetMeta } from '@/lib/client/type';
import { atom } from 'jotai';

export const currentSessionMetaAtom = atom<ResultSetMeta | any>({} as any);