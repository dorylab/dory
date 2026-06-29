export function buildDoryCliForwardArgs(argv: string[]): string[] | null {
    if (argv[0] === 'serve' || argv[0] === 'token') {
        return ['mcp', ...argv];
    }
    if (argv[0] === 'init') {
        return argv;
    }
    if (argv[0] === 'local-ai') {
        return ['agent', 'codex', ...argv.slice(1)];
    }
    if (argv[0] === 'login' && argv.includes('--local-ai')) {
        return ['mcp', 'login', ...argv.slice(1)];
    }
    return null;
}
