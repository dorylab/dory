
import { PgAuditLoggerRepository } from './logger';
import { PgAuditQueryRepository } from './query';
import { IAuditService, AuditPayload, AuditSearchParams, AuditSearchResult, OverviewFilters, OverviewResponse } from '@/types/audit';

export function createPgAuditService(): IAuditService {
    const logger = new PgAuditLoggerRepository();
    const query = new PgAuditQueryRepository();

    let inited = false;
    const ensureInit = async () => {
        if (!inited) {
            await logger.init();
            inited = true;
        }
    };

    return {
        // Write
        async logSuccess(payload: AuditPayload) {
            await ensureInit();
            return logger.logSuccess(payload);
        },
        async logError(payload: AuditPayload & { errorMessage: string }) {
            await ensureInit();
            return logger.logError(payload);
        },

        // Read
        async search(params: AuditSearchParams): Promise<AuditSearchResult> {
            return query.search(params);
        },

        async overview(filters: OverviewFilters): Promise<OverviewResponse> {
            return query.overview(filters);
        },

        async readById(id) { return query.readById(id); },
    };
}
