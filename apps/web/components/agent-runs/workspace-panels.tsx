'use client';

import { Group, type GroupProps } from 'react-resizable-panels';

/** Shared resizable shell; persistence is supplied by the owning workspace. */
export function WorkspacePanels({ mode, ...props }: GroupProps & { mode: 'agent' | 'report' }) {
    return <Group data-workspace-mode={mode} {...props} />;
}
