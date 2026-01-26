import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
    output: 'standalone',
    serverExternalPackages: ['@electric-sql/pglite', 'pino', 'better-sqlite3', 'electron'],
    outputFileTracingIncludes: {
        '/*': ['./registry/**/*'],
    },
    logging: {
        fetches: {
            fullUrl: true,
        },
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
    ],
    webpack(config, options) {
        config.resolve.alias['jotai'] = path.resolve(__dirname, 'node_modules/jotai');
        if (options.isServer) {
            config.externals.push('ssh2', 'better-sqlite3');
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
};

const withNextIntlConfig = withNextIntl(nextConfig);
export default withNextIntlConfig;
