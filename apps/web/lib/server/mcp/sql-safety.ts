import { splitMultiSQL } from '@dory/shared/utils/split-multi-sql';
import { getReadOnlyQueryKeywordList, isReadOnlyQuery } from '@/app/api/utils/sql-readonly';

export function getReadonlyMcpStatements(sqlText: string): string[] {
    const statements = splitMultiSQL(sqlText).map(statement => statement.trim()).filter(Boolean);
    if (!statements.length) {
        throw new Error('SQL is required.');
    }

    const unsafe = statements.find(statement => !isReadOnlyQuery(statement));
    if (unsafe) {
        throw new Error(`Only read-only SQL is allowed (${getReadOnlyQueryKeywordList()}). Rejected statement starts with: ${unsafe.slice(0, 40)}`);
    }

    return statements;
}
