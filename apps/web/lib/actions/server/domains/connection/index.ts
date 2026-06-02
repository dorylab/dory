import { connectionListAction } from './list';
import { connectionGetAction } from './get';
import { connectionCreateAction } from './create';
import { connectionUpdateAction } from './update';
import { connectionDeleteAction } from './delete';
import { connectionTestAction } from './test';
import { connectionConnectAction } from './connect';

export const connectionActions = [
    connectionListAction,
    connectionGetAction,
    connectionCreateAction,
    connectionUpdateAction,
    connectionDeleteAction,
    connectionTestAction,
    connectionConnectAction,
];
