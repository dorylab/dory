import type { DBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';

type Turn = { organizationId: string; userId: string; workId: string; requestId: string };

/** Validate both database provenance and actual object-store availability before registration. */
export async function readChatEvidence(db: DBService, turn: Turn, artifactId: string, limit = 100, register = true) {
    const input = { ...turn, artifactId };
    const provenance = await db.works.inspectChatEvidence(input);
    const result = await db.resultSets.readRows({ organizationId: turn.organizationId, userId: turn.userId, resultSetId: provenance.resultSetId, limit });
    if (result.dataAvailability === 'none' || ((result.rowCount ?? 0) > 0 && !result.rows.length)) {
        throw new DatabaseError('Evidence data is no longer available. Re-run the query.', 409);
    }
    if (register) await db.works.registerChatEvidence(input);
    return { provenance, result };
}

export async function revalidateChatFindingEvidence(db: DBService, turn: Turn, ids: string[]) {
    const work = await db.works.assertChatTurn(turn);
    const registered = (work.metadata?.chatTurn as { evidence?: Record<string, unknown> })?.evidence ?? {};
    for (const artifactId of new Set(ids)) {
        if (Object.hasOwn(registered, artifactId)) await readChatEvidence(db, turn, artifactId, 1, false);
    }
}
