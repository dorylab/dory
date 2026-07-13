import { getClient } from '@dory/database/postgres/client';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { PostgresDBClient } from '@dory/shared';
import { and, eq, isNull, or } from 'drizzle-orm';
import { organizations } from '@dory/database/schema';
import { organizationMembers, user } from '../../schemas';
import { translateDatabase } from '@dory/database/i18n';

export const DEFAULT_RESULT_SET_RETENTION_DAYS = 7;
export const ALLOWED_RESULT_SET_RETENTION_DAYS = [1, 3, 7, 14, 30, 90] as const;

export type ResultSetRetentionDays = (typeof ALLOWED_RESULT_SET_RETENTION_DAYS)[number];

type OrganizationMetadata = {
    resultSets?: {
        retentionDays?: number;
    };
    [key: string]: unknown;
};

export function isAllowedResultSetRetentionDays(value: unknown): value is ResultSetRetentionDays {
    return typeof value === 'number' && ALLOWED_RESULT_SET_RETENTION_DAYS.includes(value as ResultSetRetentionDays);
}

export function normalizeResultSetRetentionDays(value: unknown): ResultSetRetentionDays {
    return isAllowedResultSetRetentionDays(value) ? value : DEFAULT_RESULT_SET_RETENTION_DAYS;
}

function parseOrganizationMetadata(raw?: string | null): OrganizationMetadata {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as OrganizationMetadata) : {};
    } catch {
        return {};
    }
}

function serializeOrganizationMetadata(metadata: OrganizationMetadata) {
    return JSON.stringify(metadata);
}

export function getResultSetRetentionDaysFromOrganizationMetadata(raw?: string | null): ResultSetRetentionDays {
    return normalizeResultSetRetentionDays(parseOrganizationMetadata(raw).resultSets?.retentionDays);
}

export class PostgresOrganizationsRepository {
    private db!: PostgresDBClient;
    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    async listByUser(userId: string) {
        return this.db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
    }

    async getOrganizationBySlugOrId(value: string) {
        const rows = await this.db
            .select()
            .from(organizations)
            .where(or(eq(organizations.id, value), eq(organizations.slug, value)))
            .limit(1);

        return rows[0] ?? null;
    }

    async getOrganizationOwnerEmail(organizationId: string): Promise<string | null> {
        const rows = await this.db
            .select({
                email: user.email,
            })
            .from(organizations)
            .innerJoin(user, eq(user.id, organizations.ownerUserId))
            .where(eq(organizations.id, organizationId))
            .limit(1);

        return rows[0]?.email ?? null;
    }

    async getResultSetRetentionDays(organizationId: string): Promise<ResultSetRetentionDays> {
        const rows = await this.db.select({ metadata: organizations.metadata }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        return getResultSetRetentionDaysFromOrganizationMetadata(rows[0]?.metadata);
    }

    async setResultSetRetentionDays(organizationId: string, retentionDays: ResultSetRetentionDays): Promise<ResultSetRetentionDays> {
        const rows = await this.db.select({ metadata: organizations.metadata }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        const metadata = parseOrganizationMetadata(rows[0]?.metadata);
        metadata.resultSets = {
            ...(metadata.resultSets ?? {}),
            retentionDays,
        };

        await this.db
            .update(organizations)
            .set({
                metadata: serializeOrganizationMetadata(metadata),
                updatedAt: new Date(),
            })
            .where(eq(organizations.id, organizationId));

        return retentionDays;
    }

    async isUserInOrganization(userId: string, organizationId: string): Promise<boolean> {
        const rows = await this.db
            .select({ exists: organizationMembers.organizationId })
            .from(organizationMembers)
            .where(
                and(
                    eq(organizationMembers.organizationId, organizationId),
                    eq(organizationMembers.userId, userId),
                    or(eq(organizationMembers.status, 'active'), isNull(organizationMembers.status)),
                ),
            )
            .limit(1);

        return rows.length > 0;
    }
}
