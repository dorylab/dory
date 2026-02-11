'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import {
    computeNextHead,
    generateFood,
    isOutOfBounds,
    isOppositeDirection,
    isSelfCollision,
    type Direction,
    type Point,
} from '@/lib/games/snake';

const GRID_SIZE = 18;
const TICK_INTERVAL = 130;

const buildInitialSnake = (): Point[] => [
    { x: 9, y: 9 },
    { x: 8, y: 9 },
    { x: 7, y: 9 },
];

const GRID_CELLS: Point[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
    x: index % GRID_SIZE,
    y: Math.floor(index / GRID_SIZE),
}));

const KEY_DIRECTION_MAP: Record<string, Direction> = {
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
};

export default function SnakePage() {
    const [snake, setSnake] = useState<Point[]>(buildInitialSnake);
    const [food, setFood] = useState<Point>(() => generateFood(GRID_SIZE, buildInitialSnake()));
    const [gameOver, setGameOver] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [score, setScore] = useState(0);

    const directionRef = useRef<Direction>('right');
    const foodRef = useRef<Point>(food);

    useEffect(() => {
        foodRef.current = food;
    }, [food]);

    const handleDirectionChange = (next: Direction) => {
        if (isOppositeDirection(directionRef.current, next)) return;
        directionRef.current = next;
    };

    useEffect(() => {
        const down = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            const next = KEY_DIRECTION_MAP[key];
            if (!next) return;
            event.preventDefault();
            handleDirectionChange(next);
        };

        window.addEventListener('keydown', down);
        return () => window.removeEventListener('keydown', down);
    }, []);

    useEffect(() => {
        if (gameOver || isPaused) return;
        const id = window.setInterval(() => {
            setSnake(prev => {
                const nextHead = computeNextHead(prev[0], directionRef.current);
                const futureBody = prev.slice(0, prev.length - 1);
                const willGrow = nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y;
                const collisionBody = willGrow ? prev : futureBody;

                if (isOutOfBounds(nextHead, GRID_SIZE) || isSelfCollision(nextHead, collisionBody)) {
                    setGameOver(true);
                    return prev;
                }

                const nextSnake = [nextHead, ...prev];

                if (!willGrow) {
                    nextSnake.pop();
                } else {
                    setScore(current => current + 1);
                    setFood(generateFood(GRID_SIZE, nextSnake));
                }

                return nextSnake;
            });
        }, TICK_INTERVAL);

        return () => window.clearInterval(id);
    }, [gameOver, isPaused]);

    const snakeLookup = useMemo(() => new Set(snake.map(part => `${part.x}:${part.y}`)), [snake]);

    const statusLabel = gameOver ? 'Game over' : isPaused ? 'Paused' : 'Playing';

    const restartGame = () => {
        const initialSnake = buildInitialSnake();
        directionRef.current = 'right';
        setSnake(initialSnake);
        setFood(generateFood(GRID_SIZE, initialSnake));
        setScore(0);
        setGameOver(false);
        setIsPaused(false);
    };

    const directionPadButtonClass = 'border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50';

    return (
        <section className="flex flex-1 flex-col gap-6 px-4 pb-6 pt-8 md:px-8">
            <header className="flex flex-col gap-2">
                <p className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Classic Snake</p>
                <h1 className="text-2xl font-semibold">Play a focused round</h1>
                <p className="text-sm text-muted-foreground">
                    Use arrow keys or WASD, or rely on the on-screen pad to steer. The snake grows every time it eats food.
                </p>
            </header>

            <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">Score:</span>
                <span className="text-lg font-bold">{score}</span>
                <span className="ml-auto text-xs uppercase tracking-[0.2em] text-muted-foreground">{statusLabel}</span>
            </div>

            <div className="mx-auto w-full max-w-[min(640px,100vw)]">
                <div className="relative">
                    <div
                        className="grid gap-[1px] rounded-2xl border border-border bg-border"
                        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
                    >
                        {GRID_CELLS.map(cell => {
                            const key = `${cell.x}:${cell.y}`;
                            const isSnake = snakeLookup.has(key);
                            const isHead = snake[0].x === cell.x && snake[0].y === cell.y;
                            const isFood = food.x === cell.x && food.y === cell.y;

                            const base = 'aspect-square transition-colors';
                            const cellStyle = isFood
                                ? 'bg-secondary text-secondary-foreground'
                                : isHead
                                ? 'bg-primary text-primary-foreground'
                                : isSnake
                                ? 'bg-primary/80'
                                : 'bg-background';

                            return <span key={key} className={`${base} ${cellStyle}`}></span>;
                        })}
                    </div>

                    {gameOver && (
                        <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/80 text-center">
                            <div>
                                <p className="text-lg font-bold">Game Over</p>
                                <p className="text-sm text-muted-foreground">Hit restart to play again.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button className="w-full md:w-auto" onClick={restartGame}>
                    Restart
                </Button>
                <Button
                    className="w-full md:w-auto"
                    variant="outline"
                    disabled={gameOver}
                    onClick={() => setIsPaused(paused => !paused)}
                >
                    {isPaused ? 'Resume' : 'Pause'}
                </Button>
            </div>

            <div className="flex flex-col items-center gap-2 self-center">
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Controls</p>
                <div className="flex w-full max-w-[220px] flex-col items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`${directionPadButtonClass} h-12 w-12 rounded-full`}
                        onClick={() => handleDirectionChange('up')}
                        aria-label="Move up"
                    >
                        <ArrowUp size={16} />
                    </Button>
                    <div className="flex w-full items-center justify-between gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`${directionPadButtonClass} h-12 w-12 rounded-full`}
                            onClick={() => handleDirectionChange('left')}
                            aria-label="Move left"
                        >
                            <ArrowLeft size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`${directionPadButtonClass} h-12 w-12 rounded-full`}
                            onClick={() => handleDirectionChange('right')}
                            aria-label="Move right"
                        >
                            <ArrowRight size={16} />
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`${directionPadButtonClass} h-12 w-12 rounded-full`}
                        onClick={() => handleDirectionChange('down')}
                        aria-label="Move down"
                    >
                        <ArrowDown size={16} />
                    </Button>
                </div>
            </div>
        </section>
    );
}
