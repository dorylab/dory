'use client';

import React from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';

import TableBrowser from '../../../../components/table-browser/table-browser';
import CopilotPanel from '../copilot-panel';
import type { BaseModeProps } from './types';

export function TableMode({
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    updateTab,
    showChatbot,
    chatWidth,
    setChatWidth,
    onCloseChatbot,
    reserveRightRail = true,
}: BaseModeProps) {
    if (!activeTab) {
        return null;
    }
    return (
        <div className={['flex flex-1 flex-col min-h-0', reserveRightRail ? 'mr-10' : ''].join(' ')}>
            <Group
                orientation="horizontal"
                className="h-full min-h-0"
                onLayoutChange={(layout: Layout) => {
                    const copilotSize = layout['copilot-panel'];
                    if (copilotSize !== undefined && copilotSize > 5) setChatWidth(copilotSize);
                }}
            >
                <Panel id="main-panel" defaultSize={`${showChatbot ? 100 - chatWidth : 100}%`} minSize="40%" className="min-h-0">
                    <div className="flex h-full flex-col min-h-0">
                        <div className="flex-1 min-h-0 overflow-auto">
                            <TableBrowser activeTab={activeTab} updateTab={updateTab} />
                        </div>
                    </div>
                </Panel>

                {showChatbot && <Separator className="w-1.5 bg-border transition-colors" />}

                {showChatbot && (
                    <Panel id="copilot-panel" defaultSize={`${chatWidth}%`} minSize="15%" className="min-h-0">
                        <div className="flex h-full flex-col border-l min-h-0 bg-card">
                            <CopilotPanel
                                tabs={tabs}
                                activeTabId={activeTabId}
                                activeTab={activeTab}
                                updateTab={updateTab}
                                addTab={addTab}
                                setActiveTabId={setActiveTabId}
                                onClose={onCloseChatbot}
                            />
                        </div>
                    </Panel>
                )}
            </Group>
        </div>
    );
}
