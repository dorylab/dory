#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function printUsage() {
    console.error('Usage: node scripts/thin-macho-binaries.mjs --root <dir> --include <glob> [--include <glob> ...] [--arch <arch>]');
}

function parseArgs(argv) {
    const parsed = {
        root: null,
        arch: process.env.DORY_BUILD_ARCH || process.arch,
        includes: [],
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = argv[index + 1];

        if (arg === '--root') {
            parsed.root = value ?? null;
            index += 1;
        } else if (arg === '--arch') {
            parsed.arch = value ?? null;
            index += 1;
        } else if (arg === '--include') {
            if (value) parsed.includes.push(value);
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!parsed.root || parsed.includes.length === 0) {
        printUsage();
        process.exit(1);
    }

    return parsed;
}

function normalizeArch(arch) {
    switch (arch) {
        case 'arm64':
        case 'aarch64':
            return 'arm64';
        case 'x64':
        case 'x86_64':
        case 'amd64':
            return 'x86_64';
        default:
            return null;
    }
}

function escapeRegExp(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(glob) {
    const normalized = glob.split(path.sep).join('/');
    let source = '^';

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        const next = normalized[index + 1];

        if (char === '*' && next === '*') {
            source += '.*';
            index += 1;
        } else if (char === '*') {
            source += '[^/]*';
        } else {
            source += escapeRegExp(char);
        }
    }

    source += '$';
    return new RegExp(source);
}

function staticBaseForGlob(glob) {
    const parts = glob.split(/[\\/]/);
    const staticParts = [];

    for (const part of parts) {
        if (part.includes('*')) break;
        staticParts.push(part);
    }

    return staticParts.join(path.sep);
}

function walkFiles(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walkFiles(filePath, files);
        } else if (entry.isFile()) {
            files.push(filePath);
        }
    }

    return files;
}

function findIncludedFiles(root, includes) {
    const found = new Map();

    for (const include of includes) {
        const matcher = globToRegExp(include);
        const staticBase = staticBaseForGlob(include);
        const searchRoot = staticBase ? path.join(root, staticBase) : root;

        if (!fs.existsSync(searchRoot)) {
            console.warn(`[thin-macho] Include base not found, skipping: ${include}`);
            continue;
        }

        for (const filePath of walkFiles(searchRoot)) {
            const relativePath = path.relative(root, filePath).split(path.sep).join('/');
            if (matcher.test(relativePath)) {
                found.set(filePath, relativePath);
            }
        }
    }

    return found;
}

function commandExists(command) {
    const result = spawnSync('/usr/bin/env', ['sh', '-c', `command -v ${command}`], { encoding: 'utf8' });
    return result.status === 0;
}

function getLipoInfo(filePath) {
    const result = spawnSync('lipo', ['-info', filePath], { encoding: 'utf8' });
    return {
        ok: result.status === 0,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    };
}

function parseUniversalArchitectures(info) {
    if (!info.includes('Architectures in the fat file:')) return null;

    const match = info.match(/are:\s*(.+)$/m);
    if (!match) return [];

    return match[1].trim().split(/\s+/).filter(Boolean);
}

function thinFile(filePath, relativePath, targetArch) {
    const info = getLipoInfo(filePath);

    if (!info.ok) {
        console.warn(`[thin-macho] Failed to inspect ${relativePath}: ${info.output}`);
        return;
    }

    const architectures = parseUniversalArchitectures(info.output);
    if (!architectures) {
        console.log(`[thin-macho] Skipping non-universal binary: ${relativePath}`);
        return;
    }

    if (!architectures.includes(targetArch)) {
        console.warn(`[thin-macho] ${relativePath} does not contain ${targetArch}; contains ${architectures.join(', ')}`);
        return;
    }

    const beforeBytes = fs.statSync(filePath).size;
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.thin`);
    const result = spawnSync('lipo', [filePath, '-thin', targetArch, '-output', tempPath], { encoding: 'utf8' });

    if (result.status !== 0) {
        fs.rmSync(tempPath, { force: true });
        console.warn(`[thin-macho] Failed to thin ${relativePath}: ${`${result.stdout ?? ''}${result.stderr ?? ''}`.trim()}`);
        return;
    }

    const originalStat = fs.statSync(filePath);
    fs.chmodSync(tempPath, originalStat.mode);
    fs.renameSync(tempPath, filePath);

    const afterBytes = fs.statSync(filePath).size;
    const savedBytes = beforeBytes - afterBytes;
    console.log(`[thin-macho] ${relativePath}: ${architectures.join(', ')} -> ${targetArch}; saved ${(savedBytes / 1024 / 1024).toFixed(1)} MiB`);
}

const args = parseArgs(process.argv.slice(2));

if (process.platform !== 'darwin') {
    console.log('[thin-macho] Non-Darwin platform; skipping Mach-O thinning.');
    process.exit(0);
}

const targetArch = normalizeArch(args.arch);
if (!targetArch) {
    console.warn(`[thin-macho] Unsupported target architecture "${args.arch}"; skipping.`);
    process.exit(0);
}

if (!commandExists('lipo')) {
    console.warn('[thin-macho] lipo not found; skipping Mach-O thinning.');
    process.exit(0);
}

const root = path.resolve(args.root);
if (!fs.existsSync(root)) {
    throw new Error(`Root directory does not exist: ${root}`);
}

const includedFiles = findIncludedFiles(root, args.includes);
if (includedFiles.size === 0) {
    console.warn(`[thin-macho] No files matched includes under ${root}`);
    process.exit(0);
}

for (const [filePath, relativePath] of includedFiles) {
    thinFile(filePath, relativePath, targetArch);
}
