'use client';

import { Button } from '@/registry/new-york-v4/ui/button';
import Error from 'next/error';

// This page renders when a route like `/unknown.txt` is requested.
// In this case, the layout at `app/[locale]/layout.tsx` receives
// an invalid value as the `[locale]` param and calls `notFound()`.

export default function GlobalNotFound() {
    return (
        <html lang="en">
            <body>
                {/* <Error statusCode={404} /> */}
                <div>
                    <Button>Home</Button>
                </div>
            </body>
        </html>
    );
}
