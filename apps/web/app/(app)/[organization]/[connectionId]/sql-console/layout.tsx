'use client';

import React from 'react';
import { preloadSqlMonaco } from './components/sql-editor/monaco-loader';

preloadSqlMonaco();

export default function SqlConsoleLayout({ children }: React.PropsWithChildren) {
    return <>{children}</>;
}
