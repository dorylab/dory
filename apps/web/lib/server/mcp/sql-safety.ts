import { getReadOnlyQueryKeywordList, isReadOnlyQuery } from '@/app/api/utils/sql-readonly';
import { isReadOnlyPostgresStatement } from '@/lib/server/postgres-sql-safety';
import { splitSqlStatements } from '@/lib/server/sql-splitter';
import type { DriverType } from '@dory/drivers/types';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';

export async function getReadonlySqlStatements(sqlText: string, driverType: DriverType): Promise<string[]> {
    const statements = (await splitSqlStatements(sqlText, driverType)).map(statement => statement.trim()).filter(Boolean);
    if (!statements.length) {
        throw new Error('SQL is required.');
    }

    let unsafe: string | undefined;
    if (isPostgresFamilyConnectionType(driverType)) {
        for (const statement of statements) {
            if (!(await isReadOnlyPostgresStatement(statement))) {
                unsafe = statement;
                break;
            }
        }
    } else {
        unsafe = statements.find(statement => !isReadOnlyQuery(statement));
    }

    if (unsafe) {
        throw new Error(`Only read-only SQL is allowed (${getReadOnlyQueryKeywordList()}). Rejected statement starts with: ${unsafe.slice(0, 40)}`);
    }

    return statements;
}

export const getReadonlyMcpStatements = getReadonlySqlStatements;
