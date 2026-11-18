'use client';

import { createContext } from 'react';

// Embedded reports place navigation beside the preview's close button.
export const ReportHeaderActions = createContext<HTMLElement | null>(null);
