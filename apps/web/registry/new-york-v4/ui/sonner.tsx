'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            offset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))', right: 16 }}
            mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))', left: 16, right: 16 }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                } as React.CSSProperties
            }
            {...props}
            closeButton
        />
    );
};

export { Toaster };
