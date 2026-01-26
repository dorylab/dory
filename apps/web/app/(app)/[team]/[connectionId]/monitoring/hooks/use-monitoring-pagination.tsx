import { QueryListKey } from "@/types/monitoring";
import { PaginationState } from "@tanstack/react-table";
import { useAtom } from "jotai";
import React from "react";
import { DEFAULT_PAGINATION } from "../constants";
import { queryInsightsPaginationAtom } from "../state";

export function useQueryInsightsPagination(listKey: QueryListKey) {
    const [map, setMap] = useAtom(queryInsightsPaginationAtom);

    const state = map[listKey] ?? DEFAULT_PAGINATION;

    const setState = React.useCallback(
        (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
            setMap(prev => {
                const prevState = prev[listKey] ?? DEFAULT_PAGINATION;
                const nextState = typeof updater === 'function' ? (updater as any)(prevState) : updater;
                return {
                    ...prev,
                    [listKey]: nextState,
                };
            });
        },
        [setMap, listKey],
    );

    return [state, setState] as const;
}
