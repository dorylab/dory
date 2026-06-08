'use client';

import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@dory/web-utils';

export interface WarpDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

type WarpDialogContextType = {
    open: boolean;
    setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
};

const WarpDialogContext = React.createContext<WarpDialogContextType | null>(null);

export function useWarpDialogContext() {
    const ctx = React.useContext(WarpDialogContext);

    if (!ctx) {
        throw new Error('WarpDialog components must be used inside <WarpDialog>');
    }

    return ctx;
}

export function WarpDialog({
    open: openProp,
    onOpenChange: setOpenProp,
    ...props
}: React.ComponentProps<'div'> & WarpDialogProps) {
    const [_open, _setOpen] = React.useState(false);
    const open = openProp ?? _open;

    const setOpen = React.useCallback(
        (value: boolean | ((value: boolean) => boolean)) => {
            const openState = typeof value === 'function' ? value(open) : value;

            if (setOpenProp) {
                setOpenProp(openState);
            } else {
                _setOpen(openState);
            }
        },
        [open, setOpenProp],
    );

    React.useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    const contextValue = React.useMemo<WarpDialogContextType>(() => ({ open, setOpen }), [open, setOpen]);

    return (
        <WarpDialogContext.Provider value={contextValue}>
            <div data-slot="dialog" {...props} />
        </WarpDialogContext.Provider>
    );
}

export function WarpDialogTrigger({
    asChild = false,
    ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'div';
    const { setOpen } = useWarpDialogContext();

    return <Comp onClick={() => setOpen(prev => !prev)} data-slot="dialog-trigger" {...props} />;
}

function WarpDialogOverlay({ className, ...props }: React.ComponentProps<typeof motion.div>) {
    return (
        <motion.div
            className={cn(
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 overflow-hidden bg-primary/5',
                className,
            )}
            initial={{ opacity: 0 }}
            animate={{
                opacity: 1,
                transition: {
                    duration: 0.2,
                    ease: [0.22, 1, 0.36, 1],
                },
            }}
            exit={{
                opacity: 0,
                transition: {
                    duration: 0.14,
                    ease: [0.22, 1, 0.36, 1],
                },
            }}
            {...props}
        >
            <WarpAnimations />
        </motion.div>
    );
}

export function WarpDialogContent({
    children,
    className,
    ...props
}: React.ComponentProps<typeof motion.div>) {
    const { open, setOpen } = useWarpDialogContext();

    React.useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, setOpen]);

    return (
        <AnimatePresence>
            {open && (
                <div className="absolute">
                    <WarpDialogOverlay onClick={() => setOpen(false)} />
                    <motion.div
                        {...props}
                        role="dialog"
                        aria-modal="true"
                        className={cn('fixed inset-0 z-[1000] transform-gpu overflow-hidden will-change-transform', className)}
                        onClick={event => event.stopPropagation()}
                        initial={{
                            opacity: 0,
                        }}
                        animate={{
                            opacity: 1,
                            transition: {
                                duration: 0.18,
                                ease: [0.22, 1, 0.36, 1],
                            },
                        }}
                        exit={{
                            opacity: 0,
                        }}
                        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            ...props.style,
                        }}
                    >
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

function WarpAnimations() {
    const enterDuration = 0.28;
    const exitDuration = 0.18;

    return (
        <>
            <motion.div
                className="absolute top-[100%] left-[25%] h-1/2 w-1/2 origin-center rounded-full blur-lg will-change-transform"
                initial={{
                    scale: 0,
                    opacity: 1,
                    backgroundColor: 'hsl(var(--primary))',
                }}
                animate={{
                    scale: 8,
                    opacity: 0.16,
                    backgroundColor: 'hsl(var(--primary))',
                    transition: {
                        duration: enterDuration,
                        opacity: {
                            duration: enterDuration,
                            ease: 'easeInOut',
                        },
                    },
                }}
                exit={{
                    scale: 0,
                    opacity: 1,
                    backgroundColor: 'hsl(var(--primary))',
                    transition: {
                        duration: exitDuration,
                    },
                }}
            />
            <motion.div
                className="absolute top-[-25%] left-[-50%] h-full w-full rounded-full bg-primary/30 blur-[72px] will-change-transform"
                initial={{ opacity: 0, x: -24, y: -16 }}
                animate={{
                    opacity: 0.65,
                    x: 0,
                    y: 0,
                    transition: {
                        duration: 0.36,
                        ease: [0.22, 1, 0.36, 1],
                    },
                }}
                exit={{
                    opacity: 0,
                    transition: {
                        duration: exitDuration,
                    },
                }}
            />
            <motion.div
                className="absolute top-[25%] left-[50%] h-full w-full rounded-full bg-primary/25 blur-[72px] will-change-transform"
                initial={{ opacity: 0, x: 24, y: 16 }}
                animate={{
                    opacity: 0.65,
                    x: 0,
                    y: 0,
                    transition: {
                        duration: 0.36,
                        ease: [0.22, 1, 0.36, 1],
                    },
                }}
                exit={{
                    opacity: 0,
                    transition: {
                        duration: exitDuration,
                    },
                }}
            />
        </>
    );
}
