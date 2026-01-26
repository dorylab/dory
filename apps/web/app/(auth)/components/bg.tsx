'use client';

import { useEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const GrainGradient = dynamic(
    () => import('@paper-design/shaders-react').then((mod) => mod.GrainGradient),
    { ssr: false },
);

const Dithering = dynamic(
    () => import('@paper-design/shaders-react').then((mod) => mod.Dithering),
    { ssr: false },
);

let observer: IntersectionObserver;
const observerTargets = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();

function useIsVisible(ref: RefObject<HTMLElement | null>) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        observer ??= new IntersectionObserver((entries) => {
            for (const entry of entries) {
                observerTargets.get(entry.target)?.(entry);
            }
        });

        const el = ref.current;
        if (!el) return;

        observerTargets.set(el, (entry) => setVisible(entry.isIntersecting));
        observer.observe(el);

        return () => {
            observer.unobserve(el);
            observerTargets.delete(el);
        };
    }, [ref]);

    return visible;
}

export function HeroBackground({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const visible = useIsVisible(ref);

    const [showShaders, setShowShaders] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setShowShaders(true), 200);
        return () => clearTimeout(t);
    }, []);

    const ditherFront = '#22D3EE';

    return (
        <div ref={ref} className={cn('relative isolate overflow-hidden', className)}>
            <div className="absolute inset-0 -z-10" style={{ background: '#050814' }} />

            {showShaders && (
                <GrainGradient
                    className="absolute inset-0 -z-10 animate-fd-fade-in duration-800"
                    colors={[
                        '#3B82F6',
                        '#06B6D4',
                        '#6366F1',
                        '#0B122000',
                    ]}
                    // colorBack="#00000000"
                    softness={1}
                    intensity={0.6}
                    noise={0.5}
                    speed={0.3}
                    shape="corners"
                    minPixelRatio={1}
                    maxPixelCount={1920 * 1080}
                />
            )}

            {showShaders && (
                <Dithering
                    width={720}
                    height={720}
                    colorBack="#00000000"
                    colorFront={ditherFront}
                    shape="sphere"
                    type="4x4"
                    scale={0.5}
                    size={3}
                    speed={0}
                    frame={5000 * 120}
                    className="pointer-events-none absolute -z-10 animate-fd-fade-in duration-500 max-lg:bottom-[-50%] max-lg:-left-50 lg:top-[-6%] lg:right-[-4%]"
                    minPixelRatio={1}
                />
            )}

            <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-transparent via-transparent to-fd-background/80" />

            {children ? <div className="relative z-10">{children}</div> : null}
        </div>
    );
}
