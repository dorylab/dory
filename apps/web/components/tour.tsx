'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

import { cn } from '@dory/web-utils';
import { Button } from '@/registry/new-york-v4/ui/button';

export type TourStep = {
    selectorId: string;
    title: ReactNode;
    description?: ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    padding?: number;
    borderRadius?: number;
};

export type TourDefinition = {
    id: string;
    steps: TourStep[];
};

type TourContextValue = {
    activeTourId: string | null;
    currentStep: number;
    isActive: boolean;
    steps: TourStep[];
    totalSteps: number;
    startTour: (tourId?: string) => void;
    endTour: () => void;
    nextStep: () => void;
    previousStep: () => void;
    setSteps: (steps: TourStep[]) => void;
};

type TourProviderProps = {
    children: ReactNode;
    tours?: TourDefinition[];
    onComplete?: (tourId: string) => void;
    onSkip?: (tourId: string, step: number) => void;
    onStepChange?: (tourId: string, step: number) => void;
    className?: string;
    labels?: {
        next: string;
        finish: string;
        skip: string;
        close: string;
    };
};

const TourContext = createContext<TourContextValue | null>(null);
const DEFAULT_TOUR_ID = 'default';
const CONTENT_WIDTH = 288;
const VIEWPORT_PADDING = 16;
const TARGET_GAP = 14;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(value, max));
}

function getElementRect(step: TourStep | undefined) {
    if (!step) return null;
    const element = document.getElementById(step.selectorId);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return rect;
}

function calculateContentPosition(rect: DOMRect, position: TourStep['position'] = 'bottom') {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 190;

    if (position === 'top') {
        return {
            left: clamp(rect.left + rect.width / 2 - CONTENT_WIDTH / 2, VIEWPORT_PADDING, viewportWidth - CONTENT_WIDTH - VIEWPORT_PADDING),
            top: clamp(rect.top - estimatedHeight - TARGET_GAP, VIEWPORT_PADDING, viewportHeight - estimatedHeight - VIEWPORT_PADDING),
        };
    }

    if (position === 'left') {
        return {
            left: clamp(rect.left - CONTENT_WIDTH - TARGET_GAP, VIEWPORT_PADDING, viewportWidth - CONTENT_WIDTH - VIEWPORT_PADDING),
            top: clamp(rect.top + rect.height / 2 - estimatedHeight / 2, VIEWPORT_PADDING, viewportHeight - estimatedHeight - VIEWPORT_PADDING),
        };
    }

    if (position === 'right') {
        return {
            left: clamp(rect.right + TARGET_GAP, VIEWPORT_PADDING, viewportWidth - CONTENT_WIDTH - VIEWPORT_PADDING),
            top: clamp(rect.top + rect.height / 2 - estimatedHeight / 2, VIEWPORT_PADDING, viewportHeight - estimatedHeight - VIEWPORT_PADDING),
        };
    }

    return {
        left: clamp(rect.left + rect.width / 2 - CONTENT_WIDTH / 2, VIEWPORT_PADDING, viewportWidth - CONTENT_WIDTH - VIEWPORT_PADDING),
        top: clamp(rect.bottom + TARGET_GAP, VIEWPORT_PADDING, viewportHeight - estimatedHeight - VIEWPORT_PADDING),
    };
}

export function TourProvider({ children, tours, onComplete, onSkip, onStepChange, className, labels }: TourProviderProps) {
    const [steps, setSteps] = useState<TourStep[]>([]);
    const [currentStep, setCurrentStep] = useState(-1);
    const [activeTourId, setActiveTourId] = useState<string | null>(null);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const skipMissingRef = useRef(false);

    const activeStep = steps[currentStep];
    const isActive = currentStep >= 0 && currentStep < steps.length;
    const resolvedLabels = labels ?? {
        next: 'Next',
        finish: 'Finish',
        skip: 'Skip',
        close: 'Close',
    };

    const endTour = useCallback(() => {
        const tourId = activeTourId ?? DEFAULT_TOUR_ID;
        onSkip?.(tourId, currentStep);
        setCurrentStep(-1);
        setActiveTourId(null);
        setTargetRect(null);
    }, [activeTourId, currentStep, onSkip]);

    const completeTour = useCallback(() => {
        const tourId = activeTourId ?? DEFAULT_TOUR_ID;
        onComplete?.(tourId);
        setCurrentStep(-1);
        setActiveTourId(null);
        setTargetRect(null);
    }, [activeTourId, onComplete]);

    const moveToStep = useCallback(
        (next: number) => {
            if (next < 0) return;
            if (next >= steps.length) {
                completeTour();
                return;
            }
            setCurrentStep(next);
            onStepChange?.(activeTourId ?? DEFAULT_TOUR_ID, next);
        },
        [activeTourId, completeTour, onStepChange, steps.length],
    );

    const nextStep = useCallback(() => {
        moveToStep(currentStep + 1);
    }, [currentStep, moveToStep]);

    const previousStep = useCallback(() => {
        moveToStep(currentStep - 1);
    }, [currentStep, moveToStep]);

    const startTour = useCallback(
        (tourId?: string) => {
            const nextSteps = tourId && tours ? (tours.find(tour => tour.id === tourId)?.steps ?? []) : steps;
            const firstAvailableStep = nextSteps.findIndex(step => Boolean(document.getElementById(step.selectorId)));
            if (firstAvailableStep < 0) return;

            skipMissingRef.current = false;
            setSteps(nextSteps);
            setActiveTourId(tourId ?? DEFAULT_TOUR_ID);
            setCurrentStep(firstAvailableStep);
            onStepChange?.(tourId ?? DEFAULT_TOUR_ID, firstAvailableStep);
        },
        [onStepChange, steps, tours],
    );

    const updateTargetRect = useCallback(() => {
        const rect = getElementRect(activeStep);
        setTargetRect(rect);
        if (!rect || !activeStep) return;

        const targetTop = rect.top;
        const targetBottom = rect.bottom;
        if (targetTop < VIEWPORT_PADDING || targetBottom > window.innerHeight - VIEWPORT_PADDING) {
            document.getElementById(activeStep.selectorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeStep]);

    useEffect(() => {
        if (!isActive) return;
        const onWindowChange = () => updateTargetRect();
        window.addEventListener('resize', onWindowChange);
        window.addEventListener('scroll', onWindowChange, true);
        const frame = window.requestAnimationFrame(updateTargetRect);

        return () => {
            window.removeEventListener('resize', onWindowChange);
            window.removeEventListener('scroll', onWindowChange, true);
            window.cancelAnimationFrame(frame);
        };
    }, [isActive, updateTargetRect]);

    useEffect(() => {
        if (!isActive || targetRect || skipMissingRef.current) return;
        skipMissingRef.current = true;
        const timer = window.setTimeout(() => {
            skipMissingRef.current = false;
            moveToStep(currentStep + 1);
        }, 120);
        return () => window.clearTimeout(timer);
    }, [currentStep, isActive, moveToStep, targetRect]);

    useEffect(() => {
        if (!isActive) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                nextStep();
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                previousStep();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                endTour();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [endTour, isActive, nextStep, previousStep]);

    const contextValue = useMemo<TourContextValue>(
        () => ({
            activeTourId,
            currentStep,
            isActive,
            steps,
            totalSteps: steps.length,
            startTour,
            endTour,
            nextStep,
            previousStep,
            setSteps,
        }),
        [activeTourId, currentStep, endTour, isActive, nextStep, previousStep, startTour, steps],
    );

    const spotlightPadding = activeStep?.padding ?? 8;
    const spotlightRadius = activeStep?.borderRadius ?? 8;
    const contentPosition = targetRect ? calculateContentPosition(targetRect, activeStep?.position) : null;
    const isLastStep = currentStep >= steps.length - 1;

    return (
        <TourContext.Provider value={contextValue}>
            {children}
            <AnimatePresence>
                {isActive && activeStep && targetRect && contentPosition ? (
                    <>
                        <motion.div
                            aria-hidden="true"
                            className={cn('pointer-events-none fixed z-50 border-2 border-primary bg-background/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]', className)}
                            initial={false}
                            animate={{
                                top: targetRect.top - spotlightPadding,
                                left: targetRect.left - spotlightPadding,
                                width: targetRect.width + spotlightPadding * 2,
                                height: targetRect.height + spotlightPadding * 2,
                                borderRadius: spotlightRadius,
                            }}
                            transition={{ duration: 0.18 }}
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="false"
                            className="fixed z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-xl"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1, top: contentPosition.top, left: contentPosition.left }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.16 }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold">{activeStep.title}</div>
                                    {activeStep.description ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{activeStep.description}</div> : null}
                                </div>
                                <Button variant="ghost" size="icon-xs" className="-mr-1 -mt-1" onClick={endTour} aria-label={resolvedLabels.close}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <div className="text-xs text-muted-foreground">
                                    {currentStep + 1} / {steps.length}
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isLastStep ? (
                                        <Button variant="ghost" size="xs" onClick={endTour}>
                                            {resolvedLabels.skip}
                                        </Button>
                                    ) : null}
                                    <Button size="xs" onClick={nextStep}>
                                        {isLastStep ? resolvedLabels.finish : resolvedLabels.next}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                ) : null}
            </AnimatePresence>
        </TourContext.Provider>
    );
}

export function useTour() {
    const context = useContext(TourContext);
    if (!context) {
        throw new Error('useTour must be used within TourProvider');
    }
    return context;
}
