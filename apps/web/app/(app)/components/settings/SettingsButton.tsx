'use client';

import * as React from 'react';
import { SettingsModal } from './SettingsModal';

export function SettingsButton() {
    const [open, setOpen] = React.useState(false);
    return <SettingsModal open={open} onOpenChange={setOpen} />;
}
