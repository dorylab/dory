import { getClickhousePrivilegesImpl, type ClickhousePrivilegesImpl } from './privileges-impl';
import type { ClickhouseDatasource } from '../ClickhouseDatasource';

export { type ClickhousePrivilegesImpl };

export function createClickhousePrivilegesCapability(datasource: ClickhouseDatasource): ClickhousePrivilegesImpl {
    return getClickhousePrivilegesImpl(datasource);
}
