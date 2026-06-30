import type { DBService } from '@dory/database';
import type { NextRequest } from 'next/server';

export type WebActionServices = {
    db: DBService;
    req?: NextRequest;
    requestOrigin?: string | null;
    workspaceOrigin?: string | null;
};
