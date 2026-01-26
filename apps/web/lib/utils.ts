import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { authFetch } from '@/lib/client/auth-fetch';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
    return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

export const fetcher = async (url: string) => {
    const res = await authFetch(url);

    // If status is not in 200-299,
    // still try to parse and throw.
    if (!res.ok) {
        const error = new Error('An error occurred while fetching the data.');
        // Attach extra info to the error object.
        // error.info = await res.json();
        // error.status = res.status;
        throw error;
    }

    return res.json();
};
