import localFont from 'next/font/local';

import { cn } from '@/lib/utils';
import { SignInForm } from '../components/SignInForm';
import { BubbleBackground } from '@/components/animate-ui/components/backgrounds/bubble';
import { HeroBackground } from '../components/bg';

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
export default function SignInPage() {
    return (
        <div
            className={cn(
                'bg-muted dark:bg-background flex flex-1 flex-col items-center justify-center gap-16 p-6 h-screen',
                // fontSans.variable,
                // fontSerif.variable,
                // fontManrope.variable,
            )}
        >
            <SignInForm className='z-100' imageUrl="https://images.unsplash.com/photo-1536147116438-62679a5e01f2?q=80&w=2688&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" />
            {/* <div className="absolute z-10 inset-0 h-full w-full bg-[#0f172a]">

            </div> */}
            <HeroBackground className="absolute z-10 inset-0 flex items-center justify-center" />
            {/* <BubbleBackground interactive={true} className="absolute z-10 inset-0 flex items-center justify-center" /> */}
        </div>
    );
}
