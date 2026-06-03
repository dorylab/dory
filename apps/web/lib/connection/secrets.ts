export function resolveTestIdentityPassword(payloadPassword: string | null | undefined, storedPassword: string | null): string | null {
    if (typeof payloadPassword === 'string' && payloadPassword.trim() !== '') {
        return payloadPassword;
    }

    if (payloadPassword === null) {
        return null;
    }

    return storedPassword;
}
