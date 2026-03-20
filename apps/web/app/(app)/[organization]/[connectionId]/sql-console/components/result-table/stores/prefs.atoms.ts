// stores/prefs.atoms.ts
import { atomWithStorage } from 'jotai/utils';

export const debugModeAtom = atomWithStorage<boolean>('studio.debug.mode', false);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const ROW_BUDGET_MIN = 5_000;
const ROW_BUDGET_MAX = 1_000_000;

export const uiRowBudgetAtom = atomWithStorage<number>('studio.result.rowBudget', 100_000, {
    getItem: (key, initial) => {
        const raw = localStorage.getItem(key);
        const val = raw ? Number(raw) : initial;
        return clamp(val, ROW_BUDGET_MIN, ROW_BUDGET_MAX);
    },
    setItem: (key, newValue) => {
        const safe = clamp(newValue, ROW_BUDGET_MIN, ROW_BUDGET_MAX);
        localStorage.setItem(key, String(safe));
    },
    removeItem: key => localStorage.removeItem(key),
});
