import type { ActionAuditRecord, ActionAuditSink } from '@dory/actions';
import type { DBService } from '@dory/database';

const MAX_ACTION_AUDIT_BUFFER = 1000;
const actionAuditBuffer: ActionAuditRecord[] = [];
let actionAuditOverrideForTests: ((event: ActionAuditRecord) => Promise<void> | void) | null = null;

export function setActionAuditWriteOverrideForTests(handler: ((event: ActionAuditRecord) => Promise<void> | void) | null) {
    actionAuditOverrideForTests = handler;
}

export function readActionAuditBufferForTests() {
    return [...actionAuditBuffer];
}

export function createWebActionAuditSink(db?: Pick<DBService, 'actionAudit'> | null): ActionAuditSink {
    return {
        async record(event) {
            if (actionAuditOverrideForTests) {
                await actionAuditOverrideForTests(event);
                return;
            }

            if (db?.actionAudit) {
                await db.actionAudit.log(event);
            }

            actionAuditBuffer.push(event);
            if (actionAuditBuffer.length > MAX_ACTION_AUDIT_BUFFER) {
                actionAuditBuffer.splice(0, actionAuditBuffer.length - MAX_ACTION_AUDIT_BUFFER);
            }
        },
    };
}
