import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const isProductionBuild = process.env.NODE_ENV === 'production';
const runtime = process.env.DORY_RUNTIME?.trim() || process.env.NEXT_PUBLIC_DORY_RUNTIME?.trim() || 'web';
const isDesktopRuntime = runtime === 'desktop';
const desktopRuntimeAliases: Record<string, string> = isDesktopRuntime
    ? {
          '@/lib/auth/session': './lib/auth/session.desktop.ts',
          '@/lib/auth/auth-proxy': './lib/auth/auth-proxy.desktop.ts',
          '@/lib/actions/server/context': './lib/actions/server/context.desktop.ts',
          '@/components/session-recovery-sync': './components/session-recovery-sync.desktop.tsx',
          '@/app/(auth)/components/SignInForm': './app/(auth)/components/SignInForm.desktop.tsx',
          '@/app/(app)/[organization]/connections/components/forms/tls/certificate-field':
              './app/(app)/[organization]/connections/components/forms/tls/certificate-field.desktop.tsx',
      }
    : {};
const desktopRuntimeWebpackAliases = Object.fromEntries(Object.entries(desktopRuntimeAliases).map(([key, value]) => [key, path.resolve(__dirname, value)]));

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
    distDir: process.env.DORY_NEXT_DIST_DIR?.trim() || '.next',
    output: 'standalone',
    typescript: {
        tsconfigPath: isProductionBuild ? 'tsconfig.build.json' : 'tsconfig.json',
    },
    transpilePackages: ['@dory/actions', '@dory/artifacts', '@dory/database', '@dory/i18n', '@dory/resultset', '@dory/shared', '@dory/ui', '@dory/web-utils'],
    serverExternalPackages: ['@duckdb/node-api', '@electric-sql/pglite', 'pino', 'better-sqlite3', 'electron', 'libpg-query', 'snowflake-sdk'],
    outputFileTracingRoot: path.join(__dirname, '../../'),
    outputFileTracingIncludes: {
        '/*': [
            './registry/**/*',
            './public/resources/demo.sqlite',
            './public/resources/demo.duckdb',
            '../../packages/database/src/pglite/migrations.json',
            '../../packages/database/src/postgres/migrations/**/*',
            '../../packages/database/src/pglite/migrations/**/*',
            '../../packages/i18n/src/locales/*.json',
            '../../node_modules/async-function/**/*',
            '../../node_modules/async-generator-function/**/*',
            '../../node_modules/generator-function/**/*',
            '../../node_modules/libpg-query/wasm/**/*',
        ],
    },
    logging: {
        fetches: {
            fullUrl: true,
        },
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
    turbopack: {
        resolveAlias: desktopRuntimeAliases,
    },
    webpack(config: NextWebpackConfigShape, options: NextWebpackOptionsShape) {
        config.resolve.alias['jotai'] = path.resolve(__dirname, 'node_modules/jotai');
        Object.assign(config.resolve.alias, desktopRuntimeWebpackAliases);
        if (options.isServer) {
            config.externals.push('ssh2', 'better-sqlite3', '@duckdb/node-api', 'snowflake-sdk');
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
