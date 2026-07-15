// app/(auth)/sign-up/page.tsx
import { SignUpForm } from '../components/SignUpform';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { HeroBackground } from '../components/bg';
import { RuntimeHint } from '../components/runtime-hint';
// import { StarsBackground } from '@/components/animate-ui/components/backgrounds/stars';
// import { cookies } from 'next/headers';

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

export default async function SignUpPage() {
    // const theme = (await cookies()).get('theme')?.value;
    return (
        <div
            className={cn(
                'bg-muted dark:bg-background relative flex flex-1 flex-col items-center justify-center gap-16 p-6 h-screen',
                // fontSans.variable,
                // fontSerif.variable,
                // fontManrope.variable,
            )}
        >
            <RuntimeHint className="absolute right-4 top-4 z-20" />
            <div className="relative z-20 w-full max-w-2xl">
                <SignUpForm />
            </div>
            <HeroBackground className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" />
        </div>
    );
}
