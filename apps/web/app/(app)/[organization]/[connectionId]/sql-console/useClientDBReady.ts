'use client';

export function useClientDBReady() {
    return { ready: true, initializing: false, error: null };
}
