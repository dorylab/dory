import { cookies } from 'next/headers';

import { cn } from '@/lib/utils';
import { SignInForm } from '../components/SignInForm';
import { getAnonymousRecoveryCookieName, resolveRecoverableAnonymousUser } from '@/lib/auth/anonymous-recovery';
import { shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { getRuntimeForServer } from '@/lib/runtime/runtime';
// import { BubbleBackground } from '@/components/animate-ui/components/backgrounds/bubble';
import { HeroBackground } from '../components/bg';
import { RuntimeHint } from '../components/runtime-hint';
import { ModeToggle } from '@/components/mode-toggle';

export const dynamic = 'force-dynamic';

// const fontSans = localFont({
//     src: [
//         { path: '../../../public/fonts/lexend-400.ttf', weight: '400', style: 'normal' },
//     ],
//     variable: '--font-sans',
//     display: 'swap',
// });

// const fontSerif = localFont({
//     src: [
//         { path: '../../../public/fonts/newsreader-400.ttf', weight: '400', style: 'normal' },
//     ],
//     variable: '--font-serif',
//     display: 'swap',
// });

// const fontManrope = localFont({
//     src: [
//         { path: '../../../public/fonts/manrope-400.ttf', weight: '400', style: 'normal' },
//     ],
//     variable: '--font-manrope',
//     display: 'swap',
// });
export default async function SignInPage() {
    const cookieStore = await cookies();
    const recoveryToken = cookieStore.get(getAnonymousRecoveryCookieName())?.value;
    const runtime = getRuntimeForServer() ?? 'web';
    const resumeAnonymousSession = shouldProxyAuthRequest()
        ? Boolean(recoveryToken)
        : Boolean(await resolveRecoverableAnonymousUser(recoveryToken));

    return (
        <div
            className={cn(
                'bg-muted dark:bg-background relative flex flex-1 flex-col items-center justify-center gap-16 p-6 h-screen',
                // fontSans.variable,
                // fontSerif.variable,
                // fontManrope.variable,
            )}
        >
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
                <ModeToggle />
                <RuntimeHint />
            </div>
            <div className="z-100 w-full max-w-md">
                <SignInForm
                    resumeAnonymousSession={resumeAnonymousSession}
                    showGuestOption={false}
                    showDemoOption={runtime !== 'desktop'}
                />
            </div>
            {/* <div className="absolute z-10 inset-0 h-full w-full bg-[#0f172a]">

            </div> */}
            <HeroBackground className="absolute z-10 inset-0 flex items-center justify-center" />
            {/* <BubbleBackground interactive={true} className="absolute z-10 inset-0 flex items-center justify-center" /> */}
        </div>
    );
}
