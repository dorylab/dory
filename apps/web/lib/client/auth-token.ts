const TOKEN_STORAGE_KEY = 'auth_token';

export async function getAuthToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}
