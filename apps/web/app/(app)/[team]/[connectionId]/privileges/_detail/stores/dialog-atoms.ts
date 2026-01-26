'use client';

import { atom } from 'jotai';

export type ScopedGrantScope = 'database' | 'table' | 'view';

export type ScopedRevokeContext = {
    scope: ScopedGrantScope;
    database: string;
    object?: string | null;
    privileges: string[];
};

export const globalGrantSelectedPrivilegesAtom = atom<string[]>([]);
export const globalRevokeSelectedPrivilegesAtom = atom<string[]>([]);

export const scopedGrantScopeAtom = atom<ScopedGrantScope>('database');
export const scopedGrantDatabaseAtom = atom('');
export const scopedGrantObjectAtom = atom('');
export const scopedGrantSelectedPrivilegesAtom = atom<string[]>([]);

export const scopedRevokeContextAtom = atom<ScopedRevokeContext | null>(null);
export const scopedRevokeSelectedPrivilegesAtom = atom<string[]>([]);

export const resetGlobalGrantSelectionAtom = atom(null, (_get, set) => {
    set(globalGrantSelectedPrivilegesAtom, []);
});

export const resetGlobalRevokeSelectionAtom = atom(null, (_get, set) => {
    set(globalRevokeSelectedPrivilegesAtom, []);
});

export const resetScopedGrantDialogAtom = atom(null, (_get, set) => {
    set(scopedGrantScopeAtom, 'database');
    set(scopedGrantDatabaseAtom, '');
    set(scopedGrantObjectAtom, '');
    set(scopedGrantSelectedPrivilegesAtom, []);
});

export const resetScopedRevokeDialogAtom = atom(null, (_get, set) => {
    set(scopedRevokeContextAtom, null);
    set(scopedRevokeSelectedPrivilegesAtom, []);
});
