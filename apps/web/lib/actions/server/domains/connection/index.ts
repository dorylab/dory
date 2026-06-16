import { connectionListAction } from './list';
import { connectionGetAction } from './get';
import { connectionCreateAction } from './create';
import { connectionUpdateAction } from './update';
import { connectionDeleteAction } from './delete';
import { connectionTestAction } from './test';
import { connectionConnectAction } from './connect';
import { connectionDuplicateAction } from './duplicate';

export const connectionActions = [
    connectionListAction,
    connectionGetAction,
    connectionCreateAction,
    connectionDuplicateAction,
    connectionUpdateAction,
    connectionDeleteAction,
    connectionTestAction,
    connectionConnectAction,
];
