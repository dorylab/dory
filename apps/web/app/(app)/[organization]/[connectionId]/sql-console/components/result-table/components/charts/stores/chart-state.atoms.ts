import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { ChartState } from '../chart-shared';

export const chartStatesByKeyAtom = atomWithStorage<Record<string, ChartState>>('sqlconsole:result-table:chart-states:v1', {}, undefined, {
    getOnInit: true,
});

export const viewModesByTabAtom = atomWithStorage<Record<string, 'overview' | 'table' | 'charts'>>('sqlconsole:result-table:view-modes:v1', {}, undefined, {
    getOnInit: true,
});

export const chartStateRevisionAtom = atom<Record<string, number>>({});
