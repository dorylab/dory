export type Direction = 'up' | 'down' | 'left' | 'right';

export type Point = {
    x: number;
    y: number;
};

const directionVectors: Record<Direction, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

export function computeNextHead(head: Point, direction: Direction): Point {
    const vector = directionVectors[direction];

    return {
        x: head.x + vector.dx,
        y: head.y + vector.dy,
    };
}

export function isOutOfBounds(point: Point, gridSize: number): boolean {
    return point.x < 0 || point.y < 0 || point.x >= gridSize || point.y >= gridSize;
}

export function isSelfCollision(point: Point, snake: Point[]): boolean {
    return snake.some(segment => segment.x === point.x && segment.y === point.y);
}

export function isOppositeDirection(current: Direction, next: Direction): boolean {
    const currentVector = directionVectors[current];
    const nextVector = directionVectors[next];

    return currentVector.dx + nextVector.dx === 0 && currentVector.dy + nextVector.dy === 0;
}

const pointKey = (point: Point) => `${point.x},${point.y}`;

export function generateFood(gridSize: number, snake: Point[], getRandom = Math.random): Point {
    const occupied = new Set(snake.map(pointKey));
    const emptyCells: Point[] = [];

    for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
            const key = `${x},${y}`;
            if (!occupied.has(key)) {
                emptyCells.push({ x, y });
            }
        }
    }

    if (emptyCells.length === 0) {
        throw new Error('No free cells available for food placement.');
    }

    const raw = getRandom();
    const index = Math.min(Math.floor(raw * emptyCells.length), emptyCells.length - 1);

    return emptyCells[index];
}
