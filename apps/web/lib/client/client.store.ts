import { atom } from 'jotai';

export const dataVersionAtom = atom(0);
// Write-only atom: used to trigger increment
export const bumpDataVersionAtom = atom(null, (get, set) => {
    // Prevent overflow by masking to 31 bits
    set(dataVersionAtom, v => (v + 1) & 0x7fffffff);
});
