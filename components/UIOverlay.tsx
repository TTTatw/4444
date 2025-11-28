import React from 'react';
import { createPortal } from 'react-dom';
import { WorkflowToolbar } from './WorkflowToolbar';
import { HistoryTray } from './HistoryTray';
import type { HistoryItem, SerializedConnection, SerializedNode, WorkflowAsset } from '../types';

interface Props {
    currentUser: { role: 'guest' | 'admin' | 'user'; name: string };
    onLogout: () => void;
    onLoad: (workflow: WorkflowAsset | { nodes: SerializedNode[], connections: SerializedConnection[], visibility?: 'public' | 'private', ownerId?: string }) => void;
    onOpenLibrary: () => void;
    onOpenHistory: () => void;
    onOpenApiKeyModal: () => void;
    onOpenAuthModal: () => void;
    onOpenAdminDashboard: () => void;
    history: HistoryItem[];
    onSelectHistory: (item: HistoryItem) => void;
    onClearHistory: () => void;
    onDeleteHistory: (id: string) => void;
    zoom: number;
    onZoomChange: (z: number) => void;
}

export const UIOverlay: React.FC<Props> = ({
    currentUser,
    onLogout,
    onLoad,
    onOpenLibrary,
    onOpenHistory,
    onOpenApiKeyModal,
    onOpenAuthModal,
    onOpenAdminDashboard,
    history,
    onSelectHistory,
    onClearHistory,
    onDeleteHistory,
    zoom,
    onZoomChange,
}) => {
    const overlay = (
        <>
            <WorkflowToolbar
                onLoad={onLoad}
                onOpenLibrary={onOpenLibrary}
                onOpenHistory={onOpenHistory}
                onOpenApiKeyModal={onOpenApiKeyModal}
                onOpenAuthModal={onOpenAuthModal}
                onOpenAdminDashboard={onOpenAdminDashboard}
                currentUser={currentUser}
                onLogout={onLogout}
                zoom={zoom}
                onZoomChange={onZoomChange}
            />
            {history.length > 0 && (
                <HistoryTray history={history} onSelect={onSelectHistory} onClearAll={onClearHistory} onDeleteItem={onDeleteHistory} />
            )}
        </>
    );

    return createPortal(overlay, document.body);
};
