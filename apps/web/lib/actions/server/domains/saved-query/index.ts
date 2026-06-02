import { savedQueryListAction } from './list';
import { savedQueryGetAction } from './get';
import { savedQueryCreateAction } from './create';
import { savedQueryUpdateAction } from './update';
import { savedQueryDeleteAction } from './delete';
import { savedQueryReorderAction, savedQueryReorderFoldersAction } from './reorder';
import { savedQueryListFoldersAction, savedQueryCreateFolderAction, savedQueryUpdateFolderAction, savedQueryDeleteFolderAction } from './folders';

export const savedQueryActions = [
    savedQueryListAction,
    savedQueryGetAction,
    savedQueryCreateAction,
    savedQueryUpdateAction,
    savedQueryDeleteAction,
    savedQueryReorderAction,
    savedQueryListFoldersAction,
    savedQueryCreateFolderAction,
    savedQueryUpdateFolderAction,
    savedQueryDeleteFolderAction,
    savedQueryReorderFoldersAction,
];
