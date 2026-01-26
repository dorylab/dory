import { logger } from 'better-auth';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || crypto.randomUUID(); // For testing purposes
if (!RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY');
}
const resend = new Resend(RESEND_API_KEY);

export async function sendEmail({
    to,
    subject,
    text,
    html,
}: {
    to: string;
    subject: string;
    text: string;
    html?: string;
}) {
    // Sender must use a verified domain/subdomain and include a friendly name
    const from = 'Dory<noreply@getdory.dev>'; // Example: your verified subdomain
    try {
        const { data, error } = await resend.emails.send({
            from,
            to,
            subject,
            text,
            ...(html ? { html } : {}),
        });
        logger.info(`Email queued: id=${data?.id} -> ${to} "${subject}"`);
    } catch (error) {
        logger.error('Resend send exception', error);
        throw error;
    }

}
