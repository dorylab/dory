import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { generateText } from 'ai';
import { getReleaseNotesChatModel } from './model';

type CliOptions = {
    from?: string;
    to: string;
    output?: string;
    maxCommits: number;
    model: string;
};

type CommitInfo = {
    hash: string;
    shortHash: string;
    date: string;
    subject: string;
    body: string;
    files: string[];
};

function main() {
    loadEnvironment();
    applyReleaseAiEnvOverrides();

    const options = parseArgs(process.argv.slice(2));
    const outputPath = options.output ? resolveOutputPath(options.output) : null;
    const fromRef = options.from ?? getLatestTag();
    const range = fromRef ? `${fromRef}..${options.to}` : options.to;
    const commits = getCommits(range, options.maxCommits);

    if (commits.length === 0) {
        const emptyMessage = fromRef
            ? `No commits found in range ${fromRef}..${options.to}.`
            : `No commits found up to ${options.to}.`;

        if (outputPath) {
            ensureParentDir(outputPath);
            writeFileSync(outputPath, `${emptyMessage}\n`, 'utf8');
        }

        process.stdout.write(`${emptyMessage}\n`);
        return;
    }

    generateReleaseNotes({
        commits,
        fromRef,
        toRef: options.to,
        modelName: options.model,
    })
        .then((notes) => {
            const normalized = sanitizeReleaseNotes(notes).trim();

            if (outputPath) {
                ensureParentDir(outputPath);
                writeFileSync(outputPath, `${normalized}\n`, 'utf8');
            }

            process.stdout.write(`${normalized}\n`);
        })
        .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[release-notes] ${message}`);
            process.exitCode = 1;
        });
}

function applyReleaseAiEnvOverrides() {
    const mappings: Array<[string, string]> = [
        ['RELEASE_NOTES_AI_PROVIDER', 'DORY_AI_PROVIDER'],
        ['RELEASE_NOTES_AI_MODEL', 'DORY_AI_MODEL'],
        ['RELEASE_NOTES_AI_API_KEY', 'DORY_AI_API_KEY'],
        ['RELEASE_NOTES_AI_URL', 'DORY_AI_URL'],
    ];

    for (const [sourceKey, targetKey] of mappings) {
        const value = process.env[sourceKey]?.trim();
        if (value) {
            process.env[targetKey] = value;
        }
    }
}

function loadEnvironment() {
    const cwd = process.cwd();
    const gitRoot = safeGitRoot();
    const candidates = [
        resolve(cwd, '.env.local'),
        resolve(cwd, '.env'),
        gitRoot ? resolve(gitRoot, '.env.local') : null,
        gitRoot ? resolve(gitRoot, '.env') : null,
    ].filter((value): value is string => Boolean(value));

    for (const file of candidates) {
        if (existsSync(file)) {
            loadEnv({ path: file, override: false, quiet: true });
        }
    }
}

function safeGitRoot() {
    try {
        return git(['rev-parse', '--show-toplevel']);
    } catch {
        return null;
    }
}

function resolveOutputPath(output: string) {
    if (output.startsWith('/')) {
        return output;
    }

    const gitRoot = safeGitRoot();
    return resolve(gitRoot ?? process.cwd(), output);
}

function ensureParentDir(path: string) {
    mkdirSync(dirname(path), { recursive: true });
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        to: 'HEAD',
        maxCommits: 200,
        model: process.env.RELEASE_NOTES_AI_MODEL ?? process.env.DORY_AI_MODEL ?? 'gpt-4o-mini',
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }

        if (arg === '--from') {
            options.from = readValue(argv, ++index, '--from');
            continue;
        }

        if (arg === '--to') {
            options.to = readValue(argv, ++index, '--to');
            continue;
        }

        if (arg === '--output' || arg === '-o') {
            options.output = readValue(argv, ++index, arg);
            continue;
        }

        if (arg === '--max-commits') {
            const value = Number(readValue(argv, ++index, '--max-commits'));
            if (!Number.isInteger(value) || value <= 0) {
                throw new Error('--max-commits must be a positive integer');
            }
            options.maxCommits = value;
            continue;
        }

        if (arg === '--model') {
            options.model = readValue(argv, ++index, '--model');
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

function readValue(argv: string[], index: number, flag: string) {
    const value = argv[index];
    if (!value) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}

function printHelp() {
    const lines = [
        'Usage: yarn release-notes [options]',
        '',
        'Options:',
        '  --from <ref>         Start ref. Defaults to the latest git tag.',
        '  --to <ref>           End ref. Defaults to HEAD.',
        '  --output, -o <file>  Write the generated markdown to a file.',
        '  --model <name>       Override RELEASE_NOTES_AI_MODEL for this run.',
        '  --max-commits <n>    Limit how many commits are sent to the model. Default: 200.',
        '  --help, -h           Show this help text.',
    ];

    process.stdout.write(`${lines.join('\n')}\n`);
}

function getLatestTag() {
    try {
        return git(['describe', '--tags', '--abbrev=0']);
    } catch {
        return undefined;
    }
}

function getCommits(range: string, maxCommits: number): CommitInfo[] {
    const hashes = git(['rev-list', '--reverse', '--max-count', String(maxCommits), range])
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);

    return hashes.map((hash) => {
        const metadata = git([
            'show',
            '-s',
            '--date=short',
            '--format=%H%x1f%ad%x1f%s%x1f%b',
            hash,
        ]);
        const [fullHash, date, subject, body = ''] = metadata.split('\u001f');
        const files = git([
            'diff-tree',
            '--no-commit-id',
            '--name-only',
            '-r',
            '-m',
            hash,
        ])
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean);

        return {
            hash: fullHash.trim(),
            shortHash: fullHash.trim().slice(0, 7),
            date: date.trim(),
            subject: subject.trim(),
            body: body.trim(),
            files,
        };
    });
}

async function generateReleaseNotes(args: {
    commits: CommitInfo[];
    fromRef?: string;
    toRef: string;
    modelName: string;
}) {
    const model = getReleaseNotesChatModel(args.modelName);
    const prompt = buildPrompt(args);

    const { text } = await generateText({
        model,
        temperature: 0.2,
        system: [
            'You write polished GitHub release notes in English.',
            'Return Markdown only.',
            'Be concrete and product-facing, but do not invent features or fixes.',
            'Infer user impact from the commits when possible, but stay conservative.',
            'Group related work into short sections such as Features, Improvements, Fixes, Docs, and Internal.',
            'Keep the output concise and scannable.',
            'Avoid mentioning commit hashes unless they add value.',
            'Do not include badges, images, download buttons, SourceForge links, or third-party promotional blocks.',
        ].join(' '),
        prompt,
    });

    return text.trim();
}

function buildPrompt(args: {
    commits: CommitInfo[];
    fromRef?: string;
    toRef: string;
    modelName: string;
}) {
    const header = [
        'Generate release notes for the following git range.',
        `From: ${args.fromRef ?? '(repository start)'}`,
        `To: ${args.toRef}`,
        `Commit count: ${args.commits.length}`,
        `Requested model: ${args.modelName}`,
        '',
        'Output requirements:',
        '- English only.',
        '- Markdown only.',
        `- Start with a short title like "## What's Changed".`,
        '- Prefer grouped bullets over a commit-by-commit dump.',
        '- Mention user-visible fixes and improvements first.',
        '- Include a brief "Internal" or "Maintenance" section only if there is meaningful engineering work.',
        '- Exclude empty sections.',
        '- Do not include badges, images, HTML image tags, download buttons, SourceForge links, or third-party promotional blocks.',
        '',
        'Commits:',
    ];

    const commits = args.commits.map(formatCommitForPrompt);

    return `${header.join('\n')}\n${commits.join('\n\n')}`;
}

function formatCommitForPrompt(commit: CommitInfo) {
    const files = commit.files.length > 0
        ? commit.files.slice(0, 12).join(', ')
        : '(no file list)';
    const remainder = commit.files.length > 12 ? `, +${commit.files.length - 12} more` : '';

    const lines = [
        `- ${commit.subject}`,
        `  hash: ${commit.shortHash}`,
        `  date: ${commit.date}`,
        `  files: ${files}${remainder}`,
    ];

    if (commit.body) {
        lines.push(`  body: ${collapseWhitespace(commit.body)}`);
    }

    return lines.join('\n');
}

function collapseWhitespace(value: string) {
    return value.replace(/\s+/g, ' ').trim();
}

function sanitizeReleaseNotes(notes: string) {
    return notes
        .split('\n')
        .filter((line) => {
            const normalizedLine = line.toLowerCase();
            if (normalizedLine.includes('sourceforge')) return false;
            if (normalizedLine.includes('trusted for open source')) return false;
            if (normalizedLine.includes('download now') && /!\[|<img|sourceforge|download/i.test(line)) return false;
            if (/!\[[^\]]*download[^\]]*\]\([^)]*\)/i.test(line)) return false;
            if (/<img\b[^>]*(sourceforge|download now)[^>]*>/i.test(line)) return false;
            return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
}

function git(args: string[]) {
    return execFileSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

main();
