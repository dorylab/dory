export function isMissingAiEnvError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return (
        message.includes('DORY_AI_API_KEY') ||
        message.includes('DORY_AI_URL') ||
        message.includes('MISSING_AI_ENV')
    );
}
