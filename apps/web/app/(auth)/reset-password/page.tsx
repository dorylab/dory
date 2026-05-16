// app/(auth)/reset-password/page.tsx
import { ResetPasswordForm } from '../components/ResetPasswordForm';
import { HeroBackground } from '../components/bg';
import { RuntimeHint } from '../components/runtime-hint';
import { cn } from '@dory/web-utils';

export default function ResetPasswordPage() {
    return (
        <div className={cn('bg-muted dark:bg-background relative flex flex-1 flex-col items-center justify-center gap-16 p-6 h-screen')}>
            <RuntimeHint className="absolute right-4 top-4 z-20" />
            <ResetPasswordForm className="relative z-20" />
            <HeroBackground className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" />
        </div>
    );
}
