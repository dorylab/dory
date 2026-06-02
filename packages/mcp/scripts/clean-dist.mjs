import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await rm(path.resolve(__dirname, '../dist'), {
    recursive: true,
    force: true,
});
