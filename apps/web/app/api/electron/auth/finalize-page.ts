import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { NextResponse } from 'next/server';

const DEEP_LINK = 'dory://auth-complete';
const DEFAULT_THEME = 'blue';
const THEME_COOKIE = 'active_theme';
const SUPPORTED_THEMES = new Set(['default', 'default-scaled', 'blue', 'blue-scaled', 'green', 'amber', 'liquid', 'liquid-scaled', 'mono-scaled']);

export type FinalizePageCopy = {
    title: string;
    description: string;
    openApp: string;
    closePage: string;
    hint: string;
};

export function buildElectronAuthDeepLinkUrl(params: Record<string, string | undefined | null>) {
    const deepLinkUrl = new URL(DEEP_LINK);
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            deepLinkUrl.searchParams.set(key, value);
        }
    }
    return deepLinkUrl.toString();
}

export function getElectronAuthFinalizePageCopy(locale: Awaited<ReturnType<typeof getApiLocale>>): FinalizePageCopy {
    return {
        title: translateApi('Api.ElectronAuthFinalize.Title', undefined, locale),
        description: translateApi('Api.ElectronAuthFinalize.Description', undefined, locale),
        openApp: translateApi('Api.ElectronAuthFinalize.OpenApp', undefined, locale),
        closePage: translateApi('Api.ElectronAuthFinalize.ClosePage', undefined, locale),
        hint: translateApi('Api.ElectronAuthFinalize.Hint', undefined, locale),
    };
}

function getCookieValue(req: Request, name: string) {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) return null;

    const prefix = `${name}=`;
    const entry = cookieHeader
        .split(';')
        .map(part => part.trim())
        .find(part => part.startsWith(prefix));

    if (!entry) return null;

    try {
        return decodeURIComponent(entry.slice(prefix.length));
    } catch {
        return entry.slice(prefix.length);
    }
}

function getActiveTheme(req: Request) {
    const theme = getCookieValue(req, THEME_COOKIE) ?? DEFAULT_THEME;
    return SUPPORTED_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function escapeHtml(value: string) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderDoryLogo() {
    return `
      <svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="840 320 705 280" role="img" aria-label="Dory">
        <path d="M936.00,529.50 L962.00,527.50 L993.00,517.50 L1014.00,502.50 L1028.50,486.00 L1038.50,468.00 L1044.50,443.00 L1044.50,410.00 L1036.50,382.00 L1028.50,368.00 L1012.00,349.50 L995.00,337.50 L977.00,329.50 L962.00,325.50 L936.00,322.50 L845.00,322.50 L843.50,324.00 L843.50,529.00 L920.00,530.50 L936.00,529.50 Z M928.00,508.50 L871.00,508.50 L869.50,507.00 L869.50,346.00 L871.00,344.50 L936.00,344.50 L966.00,350.50 L983.00,358.50 L996.00,368.50 L1006.50,381.00 L1013.50,394.00 L1017.50,407.00 L1019.50,432.00 L1015.50,455.00 L1007.50,472.00 L995.00,486.50 L979.00,497.50 L961.00,504.50 L928.00,508.50 Z" fill="currentColor" fill-rule="evenodd" />
        <path d="M1169.00,531.50 L1185.00,529.50 L1202.00,521.50 L1211.00,515.50 L1226.50,499.00 L1233.50,487.00 L1237.50,476.00 L1240.50,458.00 L1239.50,436.00 L1234.50,418.00 L1225.50,402.00 L1214.00,389.50 L1200.00,379.50 L1186.00,373.50 L1174.00,370.50 L1151.00,369.50 L1137.00,371.50 L1134.00,373.50 L1124.00,375.50 L1112.00,381.50 L1104.00,387.50 L1086.50,407.00 L1079.50,421.00 L1075.50,436.00 L1075.50,468.00 L1083.50,491.00 L1091.50,503.00 L1104.00,515.50 L1123.00,526.50 L1140.00,531.50 L1169.00,531.50 Z M1160.00,511.50 L1151.00,511.50 L1137.00,508.50 L1122.00,500.50 L1106.50,483.00 L1102.50,474.00 L1099.50,461.00 L1100.50,436.00 L1105.50,422.00 L1111.50,413.00 L1124.00,400.50 L1131.00,396.50 L1141.00,392.50 L1152.00,390.50 L1174.00,392.50 L1181.00,394.50 L1194.00,402.50 L1207.50,418.00 L1212.50,429.00 L1215.50,441.00 L1214.50,466.00 L1210.50,479.00 L1204.50,489.00 L1187.00,504.50 L1178.00,508.50 L1160.00,511.50 Z" fill="currentColor" fill-rule="evenodd" />
        <path d="M1303.50,528.00 L1303.50,445.00 L1307.50,423.00 L1314.50,410.00 L1329.00,397.50 L1344.00,392.50 L1361.00,392.50 L1362.50,391.00 L1362.50,371.00 L1361.00,369.50 L1350.00,369.50 L1333.00,373.50 L1318.00,381.50 L1304.00,397.50 L1302.50,396.00 L1301.50,374.00 L1300.00,372.50 L1279.50,373.00 L1279.50,529.00 L1303.00,529.50 L1303.50,528.00 Z" fill="currentColor" fill-rule="evenodd" />
        <path d="M1421.00,590.50 L1426.00,590.50 L1435.00,587.50 L1443.00,582.50 L1449.50,577.00 L1459.50,563.00 L1535.50,391.00 L1541.50,376.00 L1541.00,372.50 L1519.00,372.50 L1516.50,375.00 L1483.50,452.00 L1474.50,474.00 L1474.50,477.00 L1462.00,503.50 L1458.50,501.00 L1455.50,495.00 L1449.50,478.00 L1437.50,454.00 L1403.50,375.00 L1401.00,372.50 L1378.00,372.50 L1376.50,374.00 L1412.50,455.00 L1420.50,470.00 L1420.50,473.00 L1432.50,497.00 L1432.50,500.00 L1442.50,519.00 L1442.50,522.00 L1448.50,532.00 L1448.50,536.00 L1439.50,554.00 L1430.00,565.50 L1421.00,569.50 L1409.00,570.50 L1396.00,567.50 L1384.00,559.50 L1375.50,575.00 L1375.50,578.00 L1382.00,583.50 L1396.00,589.50 L1408.00,591.50 L1421.00,590.50 Z" fill="currentColor" fill-rule="evenodd" />
      </svg>
    `;
}

export function createElectronAuthFinalizeResponse(req: Request, deepLinkUrl: string, copy: FinalizePageCopy) {
    const theme = getActiveTheme(req);
    const title = escapeHtml(copy.title);
    const description = escapeHtml(copy.description);
    const openApp = escapeHtml(copy.openApp);
    const closePage = escapeHtml(copy.closePage);
    const hint = escapeHtml(copy.hint);
    const escapedDeepLinkUrl = escapeHtml(deepLinkUrl);

    return new NextResponse(
        `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#f8fafc" />
          <title>${title}</title>
          <script>
            try {
              var storedTheme = localStorage.theme;
              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              var isDark = storedTheme === 'dark' || ((!storedTheme || storedTheme === 'system') && prefersDark);
              document.documentElement.classList.toggle('dark', isDark);
              document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
              document.querySelector('meta[name="theme-color"]').setAttribute('content', isDark ? '#0a0a0a' : '#f8fafc');
            } catch (_) {}
          </script>
          <style>
            :root {
              --radius: 0.625rem;
              --background: oklch(1 0 0);
              --foreground: oklch(0.145 0 0);
              --card: oklch(1 0 0);
              --card-foreground: oklch(0.145 0 0);
              --primary: oklch(0.546 0.245 262.881);
              --primary-foreground: oklch(0.97 0.014 254.604);
              --secondary: oklch(0.97 0 0);
              --secondary-foreground: oklch(0.205 0 0);
              --muted: oklch(0.97 0 0);
              --muted-foreground: oklch(0.556 0 0);
              --accent: oklch(0.97 0 0);
              --accent-foreground: oklch(0.205 0 0);
              --border: oklch(0.922 0 0);
              --input: oklch(0.922 0 0);
              --ring: oklch(0.708 0 0);
              --surface: oklch(0.98 0 0);
              font-synthesis-weight: none;
              text-rendering: optimizeLegibility;
            }
            html.dark {
              --background: oklch(0.145 0 0);
              --foreground: oklch(0.985 0 0);
              --card: oklch(0.205 0 0);
              --card-foreground: oklch(0.985 0 0);
              --secondary: oklch(0.269 0 0);
              --secondary-foreground: oklch(0.985 0 0);
              --muted: oklch(0.269 0 0);
              --muted-foreground: oklch(0.708 0 0);
              --accent: oklch(0.371 0 0);
              --accent-foreground: oklch(0.985 0 0);
              --border: oklch(1 0 0 / 10%);
              --input: oklch(1 0 0 / 15%);
              --ring: oklch(0.556 0 0);
              --surface: oklch(0.2 0 0);
            }
            body.theme-default,
            body.theme-default-scaled,
            body.theme-mono-scaled {
              --primary: oklch(0.205 0 0);
              --primary-foreground: oklch(0.985 0 0);
            }
            html.dark body.theme-default,
            html.dark body.theme-default-scaled,
            html.dark body.theme-mono-scaled {
              --primary: oklch(0.922 0 0);
              --primary-foreground: oklch(0.205 0 0);
            }
            body.theme-blue,
            body.theme-blue-scaled,
            body.theme-liquid,
            body.theme-liquid-scaled {
              --primary: oklch(0.546 0.245 262.881);
              --primary-foreground: oklch(0.97 0.014 254.604);
            }
            body.theme-green {
              --primary: oklch(0.648 0.2 131.684);
              --primary-foreground: oklch(0.986 0.031 120.757);
            }
            body.theme-amber {
              --primary: oklch(0.666 0.179 58.318);
              --primary-foreground: oklch(0.987 0.022 95.277);
            }
            * {
              box-sizing: border-box;
              border-color: var(--border);
              outline-color: color-mix(in oklab, var(--ring) 50%, transparent);
            }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px;
              overflow-x: hidden;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background:
                linear-gradient(180deg, var(--background) 0%, color-mix(in oklab, var(--surface) 88%, var(--primary) 12%) 100%);
              color: var(--foreground);
            }
            body::before {
              position: fixed;
              inset: 0;
              z-index: -1;
              content: "";
              background-image:
                linear-gradient(color-mix(in oklab, var(--border) 44%, transparent) 1px, transparent 1px),
                linear-gradient(90deg, color-mix(in oklab, var(--border) 44%, transparent) 1px, transparent 1px);
              background-size: 44px 44px;
              mask-image: linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%);
              opacity: 0.42;
            }
            [data-slot='card'] {
              width: min(572px, 100%);
              display: flex;
              flex-direction: column;
              gap: 24px;
              border: 1px solid var(--border);
              border-radius: calc(var(--radius) + 4px);
              background: color-mix(in oklab, var(--card) 96%, var(--primary) 4%);
              padding: 28px;
              color: var(--card-foreground);
              box-shadow: 0 20px 60px color-mix(in oklab, var(--foreground) 12%, transparent);
            }
            .brand {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              min-height: 32px;
              color: var(--primary);
            }
            .logo {
              display: block;
              width: 88px;
              height: auto;
            }
            .indicator {
              width: 10px;
              height: 10px;
              border-radius: 999px;
              background: var(--primary);
              box-shadow: 0 0 0 5px color-mix(in oklab, var(--primary) 14%, transparent);
            }
            .content {
              display: grid;
              gap: 10px;
            }
            h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 650;
              letter-spacing: 0;
              line-height: 1.18;
            }
            p {
              margin: 0;
              color: var(--muted-foreground);
              font-size: 15px;
              line-height: 1.6;
            }
            .actions {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
            }
            [data-slot='button'] {
              min-height: 40px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              border: 1px solid transparent;
              border-radius: calc(var(--radius) - 2px);
              padding: 9px 16px;
              font-size: 14px;
              font-weight: 500;
              line-height: 1.2;
              text-decoration: none;
              white-space: nowrap;
              transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
              cursor: pointer;
            }
            [data-slot='button']:focus-visible {
              outline: 0;
              box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
            }
            [data-slot='button']:active {
              transform: translateY(1px);
            }
            [data-variant='default'] {
              background: var(--primary);
              color: var(--primary-foreground);
            }
            [data-variant='default']:hover {
              background: color-mix(in oklab, var(--primary) 90%, var(--foreground) 10%);
            }
            [data-variant='outline'] {
              border-color: var(--input);
              background: var(--background);
              color: var(--foreground);
              box-shadow: 0 1px 2px color-mix(in oklab, var(--foreground) 7%, transparent);
            }
            [data-variant='outline']:hover {
              background: var(--accent);
              color: var(--accent-foreground);
            }
            .hint {
              padding-top: 2px;
              font-size: 13px;
            }
            @media (max-width: 520px) {
              body {
                place-items: end center;
                padding: 16px;
              }
              [data-slot='card'] {
                gap: 22px;
                padding: 22px;
              }
              .actions {
                flex-direction: column;
              }
              [data-slot='button'] {
                width: 100%;
              }
            }
          </style>
        </head>
        <body class="theme-${escapeHtml(theme)}">
          <main data-slot="card">
            <div class="brand">
              ${renderDoryLogo()}
              <span class="indicator" aria-hidden="true"></span>
            </div>
            <div class="content">
              <h1>${title}</h1>
              <p>${description}</p>
            </div>
            <div class="actions">
              <a id="open-link" data-slot="button" data-variant="default" href="${escapedDeepLinkUrl}">${openApp}</a>
              <button id="close-btn" data-slot="button" data-variant="outline" type="button">${closePage}</button>
            </div>
            <p class="hint">${hint}</p>
          </main>
          <script>
            const deepLinkUrl = ${JSON.stringify(deepLinkUrl)};
            const openLink = document.getElementById('open-link');
            const closeBtn = document.getElementById('close-btn');
            if (openLink) {
              openLink.setAttribute('href', deepLinkUrl);
            }
            if (closeBtn) {
              closeBtn.addEventListener('click', () => window.close());
            }

            // Trigger deep link after first paint so fallback UI is visible.
            setTimeout(() => {
              window.location.assign(deepLinkUrl);
            }, 200);
          </script>
        </body>
      </html>
    `,
        { headers: { 'Content-Type': 'text/html' } },
    );
}
