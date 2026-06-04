'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { SignInForm } from '@/app/(auth)/components/SignInForm';
import { SignUpForm } from '@/app/(auth)/components/SignUpform';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/registry/new-york-v4/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

type AuthLinkSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    callbackURL: string;
};

export function AuthLinkSheet({ open, onOpenChange, callbackURL }: AuthLinkSheetProps) {
    const t = useTranslations('Chatbot');
    const { data: session } = authClient.useSession();
    const [tab, setTab] = useState<'sign-in' | 'sign-up'>('sign-in');

    useEffect(() => {
        if (session?.user && !session.user.isAnonymous) {
            onOpenChange(false);
        }
    }, [onOpenChange, session]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="h-[95vh] w-full overflow-y-auto rounded-t-3xl border-t px-0 pb-0 sm:max-w-none">
                <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-6 pb-8">
                    <SheetHeader className="px-0 pt-6">
                        <SheetTitle>{t('AuthRequired.SheetTitle')}</SheetTitle>
                        <SheetDescription>{t('AuthRequired.SheetDescription')}</SheetDescription>
                    </SheetHeader>
                    <Tabs value={tab} onValueChange={value => setTab(value as 'sign-in' | 'sign-up')} className="pb-8 pt-4">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="sign-in">{t('AuthRequired.SignInTab')}</TabsTrigger>
                            <TabsTrigger value="sign-up">{t('AuthRequired.SignUpTab')}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="sign-in" className="mt-4">
                            <SignInForm callbackURL={callbackURL} onRequestSignUp={() => setTab('sign-up')} showGuestOption={false} />
                        </TabsContent>
                        <TabsContent value="sign-up" className="mt-4">
                            <SignUpForm callbackURL={callbackURL} onRequestSignIn={() => setTab('sign-in')} />
                        </TabsContent>
                    </Tabs>
                </div>
            </SheetContent>
        </Sheet>
    );
}
