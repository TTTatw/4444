import React, { useRef, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import type { SerializedNode, SerializedConnection, WorkflowAsset } from '../types';

interface Props {
    onLoad: (workflow: WorkflowAsset | { nodes: SerializedNode[], connections: SerializedConnection[], visibility?: 'public' | 'private', ownerId?: string }) => void;
    onOpenLibrary: () => void;
    onOpenHistory: () => void;
    onOpenApiKeyModal: () => void;
    onOpenAuthModal: () => void;
    onOpenAdminDashboard: () => void;
    currentUser: { role: 'guest' | 'admin' | 'user'; name: string };
    onLogout: () => void;
    zoom: number;
    onZoomChange: (z: number) => void;
}

const IconButton = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
        onClick={onClick}
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 transition-all hover:scale-105 shadow-sm border border-white/10"
        title={title}
    >
        {children}
    </button>
);

const LibraryIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z" /><path d="M6 18h12" /><path d="M6 14h12" /><path d="M6 10h12" /><path d="M6 6h12" /><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /></svg>);
const HistoryIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6.54 6.54L3 10" /><path d="M12 7v5l4 2" /></svg>);
const LoadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const KeyIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11a5 5 0 1 1 9.9 1" /><path d="m10 11 2 2 4-4" /><path d="M10 11v5h5" /></svg>);
const UserIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const LogoutIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
const AdminIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /><path d="M8.5 8.5v.01" /><path d="M16 15.5v.01" /><path d="M12 12v.01" /><path d="M8.5 15.5v.01" /><path d="M15.5 8.5v.01" /></svg>);

export const WorkflowToolbar: React.FC<Props> = ({ onLoad, onOpenLibrary, onOpenHistory, onOpenApiKeyModal, onOpenAuthModal, onOpenAdminDashboard, currentUser, onLogout, zoom, onZoomChange }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileLoad = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const workflowData = JSON.parse(content);
                    if (workflowData.nodes && workflowData.connections) {
                        onLoad(workflowData);
                    } else {
                        alert("Error: Invalid workflow file format.");
                    }
                } catch (error) {
                    console.error("Failed to load workflow:", error);
                    alert("Error: Could not parse the workflow file.");
                }
            };
            reader.readAsText(file);
        }
        if (event.target) {
            event.target.value = ""; // Reset input to allow loading the same file again
        }
    };

    const toolbar = (
        <div className="fixed top-6 left-6 z-[10000] flex flex-col items-center gap-3 pointer-events-auto text-sm">
            <div className="flex flex-col items-center gap-2 bg-white/5 backdrop-blur-md rounded-2xl px-2 py-3 shadow-2xl border border-white/10">
                <IconButton title="Login / Account" onClick={onOpenAuthModal}><UserIcon /></IconButton>
                {currentUser.role === 'admin' && (
                    <>
                        <IconButton title="Admin Dashboard" onClick={onOpenAdminDashboard}><AdminIcon /></IconButton>
                        <IconButton title="API Key" onClick={onOpenApiKeyModal}><KeyIcon /></IconButton>
                    </>
                )}
                <IconButton title="Asset Library" onClick={onOpenLibrary}><LibraryIcon /></IconButton>
                <IconButton title="History" onClick={onOpenHistory}><HistoryIcon /></IconButton>
                <IconButton title="Load from file" onClick={() => fileInputRef.current?.click()}><LoadIcon /></IconButton>
                {currentUser.role !== 'guest' && (
                    <IconButton title="Logout" onClick={onLogout}><LogoutIcon /></IconButton>
                )}
            </div>

            <div className="w-14 bg-white/5 backdrop-blur-md rounded-2xl px-2 py-3 shadow-2xl border border-white/10 flex flex-col items-center gap-2">
                <button
                    className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white"
                    onClick={() => onZoomChange(zoom + 0.1)}
                    title="Zoom In"
                >+</button>
                <div className="w-10">
                    <input
                        type="range"
                        min={0.2}
                        max={2}
                        step={0.05}
                        value={zoom}
                        onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                        className="accent-sky-400 w-10"
                    />
                </div>
                <button
                    className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white"
                    onClick={() => onZoomChange(zoom - 0.1)}
                    title="Zoom Out"
                >-</button>
                <span className="text-[11px] text-slate-200">{Math.round(zoom * 100)}%</span>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileLoad}
                className="hidden"
                accept=".json"
            />
        </div>
    );

    return createPortal(toolbar, document.body);
};
