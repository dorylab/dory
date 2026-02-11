import assert from 'node:assert/strict';

import { computeNextHead, generateFood, isOppositeDirection, isOutOfBounds, isSelfCollision } from '../../lib/games/snake';

// Movement projection should follow the direction vectors.
assert.deepEqual(computeNextHead({ x: 2, y: 2 }, 'left'), { x: 1, y: 2 });
assert.deepEqual(computeNextHead({ x: 0, y: 0 }, 'down'), { x: 0, y: 1 });

// Boundary and self-collision handling.
assert.ok(isOutOfBounds({ x: -1, y: 0 }, 3));
assert.ok(isOutOfBounds({ x: 5, y: 5 }, 5));
assert.ok(!isOutOfBounds({ x: 1, y: 1 }, 5));

const snake = [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
];
assert.ok(isSelfCollision({ x: 2, y: 3 }, snake));
assert.ok(!isSelfCollision({ x: 0, y: 0 }, snake));

// Direction reversal should be prevented.
assert.ok(!isOppositeDirection('up', 'left'));
assert.ok(isOppositeDirection('up', 'down'));
assert.ok(isOppositeDirection('right', 'left'));

// Food placement respects occupied cells and the provided random value.
const shortSnake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
];
const food = generateFood(3, shortSnake, () => 0);
assert.equal(food.x, 2);
assert.equal(food.y, 0);
assert.ok(!shortSnake.some(part => part.x === food.x && part.y === food.y));

// Exhausted board should throw.
const fullSnake = [];
for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
        fullSnake.push({ x, y });
    }
}

assert.throws(() => generateFood(2, fullSnake));
