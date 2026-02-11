import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';

import { fontVariables } from '@/lib/fonts';
import { Analytics } from '@/components/analytics';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/registry/new-york-v4/ui/sonner';

import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { cn } from '@/lib/utils';
import { ActiveThemeProvider } from '@/components/active-theme';
import { FontSizeProvider } from '@/components/font-size-provider';

import { siteConfig } from './config/site';
import { JotaiProvider } from '@/lib/providers/jotai-provider';

const META_THEME_COLORS = {
    light: '#ffffff',
    dark: '#09090b',
};

export const metadata: Metadata = {
    title: {
        default: siteConfig.name,
        template: `%s - ${siteConfig.name}`,
    },
    metadataBase: new URL('https://getdory.dev'),
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
        url: 'https://v4.shadcn.com',
        title: siteConfig.name,
        description: siteConfig.description,
        siteName: siteConfig.name,
        images: [
            {
                url: 'https://v4.shadcn.com/opengraph-image.png',
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
        images: ['https://v4.shadcn.com/opengraph-image.png'],
        creator: '@shadcn',
    },
    icons: {
        icon: '/favicon.ico',
        shortcut: '/favicon-16x16.png',
        apple: '/apple-touch-icon.png',
    },
    manifest: `${siteConfig.url}/site.webmanifest`,
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
    const activeThemeValue = cookieStore.get('active_theme')?.value;
    const isScaled = activeThemeValue?.endsWith('-scaled');

    const locale = await getLocale();
    const messages = await getMessages({ locale });

    return (
        <html lang={locale} suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
              try {
                if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.querySelector('meta[name="theme-color"]').setAttribute('content', '${META_THEME_COLORS.dark}')
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
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <JotaiProvider>
                        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange enableColorScheme>
                            <ActiveThemeProvider initialTheme={activeThemeValue}>
                                {children}
                                <Toaster />
                                <Analytics />
                            </ActiveThemeProvider>
                        </ThemeProvider>
                    </JotaiProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
