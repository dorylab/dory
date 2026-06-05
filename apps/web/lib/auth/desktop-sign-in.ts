import type { DesktopAuthSnapshot } from './desktop-auth-snapshot';

export function resolveDesktopSignInRedirect(snapshot: DesktopAuthSnapshot | null, callbackURL?: string | null): string | null {
    if (!snapshot?.user.id) return null;
    return callbackURL && callbackURL !== '/sign-in' ? callbackURL : '/';
}
