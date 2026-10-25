import type { NextRequest } from 'next/server';
import { chatAttachmentHttp } from '@/lib/server/chat-attachments';
export const POST = (req: NextRequest) => chatAttachmentHttp(req);
