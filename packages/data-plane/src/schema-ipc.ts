import { Table, tableToIPC, type Schema } from 'apache-arrow';

export function schemaToIpc(schema: Schema): Uint8Array {
    return tableToIPC(new Table(schema), 'file');
}
