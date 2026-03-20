import type { useSqlConsoleClient } from '../../hooks/useSqlConsoleClient';

type SqlConsoleState = ReturnType<typeof useSqlConsoleClient>;

export type BaseModeProps = Pick<
    SqlConsoleState,
    | 'tabs'
    | 'activeTab'
    | 'activeTabId'
    | 'setActiveTabId'
    | 'addTab'
    | 'updateTab'
    | 'runQuery'
> & {
    showChatbot: boolean;
    chatWidth: number;
    setChatWidth: (width: number) => void;
    onCloseChatbot: () => void;
};

export type SqlModeProps = BaseModeProps &
    Pick<SqlConsoleState, 'editorRef' | 'runQuery' | 'cancelQuery' | 'runningTabs'>;
