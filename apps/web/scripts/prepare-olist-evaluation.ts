import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (!args.includes('--output-dir')) args.push('--output-dir', path.join(root, 'localdata', 'olist-evaluation'));
const result = spawnSync(process.env.DORY_EVALUATION_PYTHON ?? 'python3', [path.join(root, 'scripts', 'olist', 'prepare.py'), ...args], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
