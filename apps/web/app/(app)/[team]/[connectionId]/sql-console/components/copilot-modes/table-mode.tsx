'use client';

import React from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

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
    runQuery,
    showChatbot,
    chatWidth,
    setChatWidth,
    onCloseChatbot,
}: BaseModeProps) {
    if (!activeTab) {
        return null;
    }
    return (
        
        <div className="flex flex-1 flex-col min-h-0 mr-10">
            <PanelGroup
                key={showChatbot ? 'table-with-copilot' : 'table-without-copilot'}
                direction="horizontal"
                className="h-full min-h-0"
                onLayout={sizes => {
                    const [, copilotSize] = sizes;
                    if (copilotSize > 5) setChatWidth(copilotSize);
                }}
            >
                <Panel defaultSize={showChatbot ? 100 - chatWidth : 100} minSize={40} order={1} className="min-h-0">
                    <div className="flex h-full flex-col min-h-0">
                        <div className="flex-1 min-h-0 overflow-auto">
                            <TableBrowser activeTab={activeTab} updateTab={updateTab} runQuery={runQuery} />
                        </div>
                    </div>
                </Panel>

                <PanelResizeHandle
                    className={[
                        'w-1.5 bg-border data-[resize-handle-active=true]:bg-foreground/30 transition-colors',
                        showChatbot ? '' : 'hidden',
                    ].join(' ')}
                />

                <Panel
                    defaultSize={showChatbot ? chatWidth : 0}
                    minSize={showChatbot ? 15 : 0}
                    order={2}
                    className="min-h-0"
                >
                    {showChatbot ? (
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
                    ) : null}
                </Panel>
            </PanelGroup>
        </div>
    );
}
