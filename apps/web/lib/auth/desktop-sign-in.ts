import type { DesktopAuthSnapshot } from './desktop-auth-snapshot';

export function resolveDesktopSignInState(snapshot: DesktopAuthSnapshot | null, callbackURL: string | null | undefined, hasRecoverableAnonymousSession: boolean) {
    return {
        redirectTo: snapshot?.user.id ? (callbackURL && callbackURL !== '/sign-in' ? callbackURL : '/') : null,
        resumeAnonymousSession: !snapshot?.user.id && hasRecoverableAnonymousSession,
    };
}
