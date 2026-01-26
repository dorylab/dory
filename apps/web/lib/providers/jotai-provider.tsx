'use client';

import { createStore, Provider } from 'jotai';
import { ReactNode, useState } from 'react';

export function JotaiProvider({ children }: { children?: ReactNode }) {
    const [store] = useState(() => createStore());
    return <Provider store={store}>{children}</Provider>;
}
