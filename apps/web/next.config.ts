import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');
const runtime = process.env.DORY_RUNTIME?.trim() || process.env.NEXT_PUBLIC_DORY_RUNTIME?.trim() || 'web';
const isDesktopRuntime = runtime === 'desktop';

type NextWebpackConfigShape = {
    resolve: {
        alias: Record<string, string>;
        fallback?: Record<string, false>;
    };
    externals: Array<unknown>;
    module: {
        rules: Array<{
            test: RegExp;
            type: 'asset/resource';
        }>;
    };
    plugins: Array<unknown>;
};

type NextWebpackOptionsShape = {
    isServer: boolean;
};

const nextConfig = {
    output: 'standalone',
    serverExternalPackages: ['@duckdb/node-api', '@electric-sql/pglite', 'pino', 'better-sqlite3', 'electron'],
    outputFileTracingIncludes: {
        '/*': ['./registry/**/*', './public/resources/demo.sqlite'],
    },
    logging: {
        fetches: {
            fullUrl: true,
        },
        browserToTerminal: true,
        // 'error' — errors only (default)
        // 'warn'  — warnings and errors
        // true    — all console output
        // false   — disabled
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'avatars.githubusercontent.com',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },
    rewrites: async () => [
        { source: '/healthz', destination: '/api/health' },
        { source: '/api/healthz', destination: '/api/health' },
        { source: '/health', destination: '/api/health' },
        { source: '/ping', destination: '/api/health' },
        { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
        { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ],
    skipTrailingSlashRedirect: true,
    webpack(config: NextWebpackConfigShape, options: NextWebpackOptionsShape) {
        config.resolve.alias['jotai'] = path.resolve(__dirname, 'node_modules/jotai');
        if (isDesktopRuntime) {
            config.resolve.alias['@/lib/auth/session'] = path.resolve(__dirname, 'lib/auth/session.desktop.ts');
            config.resolve.alias['@/lib/auth/auth-proxy'] = path.resolve(__dirname, 'lib/auth/auth-proxy.desktop.ts');
            config.resolve.alias['@/components/session-recovery-sync'] = path.resolve(__dirname, 'components/session-recovery-sync.desktop.tsx');
        }
        if (options.isServer) {
            config.externals.push('ssh2', 'better-sqlite3', '@duckdb/node-api');
        }
        if (!options.isServer) {
            config.resolve.fallback = {
                tls: false,
                net: false,
                fs: false,
            };
        }
        config.module.rules.push({ test: /\.wasm$/, type: 'asset/resource' }, { test: /duckdb-.*\.worker\.js$/, type: 'asset/resource' });
        console.log(options.isServer ? 'Server' : 'Client', 'build');
        if (!options.isServer) {
            config.plugins.push(
                new MonacoWebpackPlugin({
                    filename: 'static/[name].worker.js',
                    languages: [],
                    customLanguages: [
                        {
                            label: 'mysql',
                            entry: 'monaco-sql-languages/esm/languages/mysql/mysql.contribution',
                            worker: {
                                id: '/esm/languages/mysql/',
                                entry: 'monaco-sql-languages/esm/languages/mysql/mysql.worker',
                            },
                        },
                        {
                            label: 'pgsql',
                            entry: 'monaco-sql-languages/esm/languages/pgsql/pgsql.contribution',
                            worker: {
                                id: '/esm/languages/pgsql/',
                                entry: 'monaco-sql-languages/esm/languages/pgsql/pgsql.worker',
                            },
                        },
                    ],
                }),
            );
            config.module.rules.push({ test: /\.ttf$/, type: 'asset/resource' });
        }
        return config;
    },
} satisfies NextConfig;

const withNextIntlConfig = withNextIntl(nextConfig);
export default withNextIntlConfig;
