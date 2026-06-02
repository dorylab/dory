import { chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await chmod(path.resolve(__dirname, '../dist/cli.js'), 0o755);
