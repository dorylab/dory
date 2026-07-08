import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';

import { fontVariables } from '@/lib/fonts';
import { Analytics } from '@/components/analytics';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/registry/new-york-v4/ui/sonner';

import './themes.css';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { cn } from '@dory/web-utils';
import { ActiveThemeProvider } from '@/components/active-theme';
import { ElectronLocaleSync } from '@/components/electron-locale-sync';
import { FontSizeProvider } from '@/components/font-size-provider';
import { ElectronThemeSync } from '@/components/electron-theme-sync';

import { siteConfig } from './config/site';
import { JotaiProvider } from '@/lib/providers/jotai-provider';
import { PublicEnvProvider, PublicEnvScript } from 'next-runtime-env';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

const META_THEME_COLORS = {
    light: '#ffffff',
    dark: '#09090b',
};

function getMetadataBaseUrl() {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.BETTER_AUTH_URL?.trim() || siteConfig.url;

    try {
        return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`);
    } catch {
        return new URL(siteConfig.url);
    }
}

const siteUrl = getMetadataBaseUrl();

export const metadata: Metadata = {
    title: {
        default: siteConfig.name,
        template: `%s - ${siteConfig.name}`,
    },
    metadataBase: siteUrl,
    description: siteConfig.description,
    keywords: ['Clickhouse', 'Database UI', 'ch-ui', 'clickhouse ui', 'Open Source', 'SQL Editor', 'Database Management'],
    authors: [
        {
            name: 'Finnian Schlesinger',
            url: 'https://finnian.dev',
        },
    ],
    creator: 'Finnian Schlesinger',
    openGraph: {
        type: 'website',
        locale: 'en_US',
        url: '/',
        title: siteConfig.name,
        description: siteConfig.description,
        siteName: siteConfig.name,
        images: [
            {
                url: siteConfig.ogImage,
                width: 1200,
                height: 630,
                alt: siteConfig.name,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: siteConfig.name,
        description: siteConfig.description,
        images: [siteConfig.twitterImage],
    },
    icons: {
        icon: '/favicon.ico',
        shortcut: '/favicon-16x16.png',
        apple: '/apple-touch-icon.png',
    },
    manifest: new URL('/site.webmanifest', siteUrl).toString(),
};

export const viewport: Viewport = {
    themeColor: META_THEME_COLORS.light,
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const cookieStore = await cookies();
    const activeThemeValue = cookieStore.get('active_theme')?.value ?? 'blue';
    const isScaled = activeThemeValue?.endsWith('-scaled');

    const locale = await getLocale();
    const messages = await getMessages({ locale });

    return (
        <html lang={locale} suppressHydrationWarning>
            <head>
                <PublicEnvScript />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
              try {
                var storedTheme = localStorage.theme;
                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                var isDark = storedTheme === 'dark' || ((!storedTheme || storedTheme === 'system') && prefersDark);
                document.documentElement.classList.toggle('dark', isDark);
                document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
                if (isDark) {
                  document.querySelector('meta[name="theme-color"]').setAttribute('content', '${META_THEME_COLORS.dark}');
                } else {
                  document.querySelector('meta[name="theme-color"]').setAttribute('content', '${META_THEME_COLORS.light}');
                }
              } catch (_) {}
            `,
                    }}
                />
            </head>
            <body
                className={cn(
                    'bg-background overscroll-none font-sans antialiased',
                    activeThemeValue ? `theme-${activeThemeValue}` : '',
                    isScaled ? 'theme-scaled' : '',
                    fontVariables,
                )}
            >
                <FontSizeProvider />
                <PublicEnvProvider>
                    <NextIntlClientProvider locale={locale} messages={messages}>
                        <JotaiProvider>
                            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme>
                                <NuqsAdapter>
                                    <ElectronLocaleSync />
                                    <ElectronThemeSync />
                                    <ActiveThemeProvider initialTheme={activeThemeValue}>
                                        {children}
                                        <Toaster />
                                        <Analytics />
                                    </ActiveThemeProvider>
                                </NuqsAdapter>
                            </ThemeProvider>
                        </JotaiProvider>
                    </NextIntlClientProvider>
                </PublicEnvProvider>
            </body>
        </html>
    );
}
