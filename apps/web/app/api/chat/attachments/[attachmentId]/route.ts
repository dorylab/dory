import type { NextRequest } from 'next/server';
import { chatAttachmentHttp } from '@/lib/server/chat-attachments';
export const GET = async (req: NextRequest, context: { params: Promise<{ attachmentId: string }> }) => chatAttachmentHttp(req, (await context.params).attachmentId);

export const DELETE = GET;
