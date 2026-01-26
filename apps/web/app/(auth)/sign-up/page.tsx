// app/(auth)/sign-up/page.tsx
import { BubbleBackground } from '@/components/animate-ui/components/backgrounds/bubble';
import { SignUpForm } from '../components/SignUpform';
import { cn } from '@/registry/new-york-v4/lib/utils';
import localFont from 'next/font/local';
import { StarsBackground } from '@/components/animate-ui/components/backgrounds/stars';
import { HeroBackground } from '../components/bg';
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
                'bg-muted dark:bg-background flex flex-1 flex-col items-center justify-center gap-16 p-6 h-screen',
                // fontSans.variable,
                // fontSerif.variable,
                // fontManrope.variable,
            )}
        >
            <SignUpForm className="z-100" />
            <HeroBackground className="absolute z-10 inset-0 flex items-center justify-center" />
        </div>
    );
}
