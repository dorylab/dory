import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
    // A list of all locales that are supported
    locales: ['en', 'zh', 'ja', 'es'],

    // Used when no locale matches
    defaultLocale: 'en',
    pathnames: {
        '/': '/',
        '/pathnames': {
            en: '/en',
            zh: '/zh',
            ja: '/ja',
            es: '/es',
        },
    },
});
export type Pathnames = keyof typeof routing.pathnames;
export type Locale = (typeof routing.locales)[number];
// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
// export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
