
import React, { useRef, ChangeEvent } from 'react';
import type { SerializedNode, SerializedConnection } from '../types';

interface Props {
    onLoad: (workflow: { nodes: SerializedNode[], connections: SerializedConnection[] }) => void;
    onOpenLibrary: () => void;
}

const LibraryIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z" /><path d="M6 18h12" /><path d="M6 14h12" /><path d="M6 10h12" /><path d="M6 6h12" /><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /></svg>);
const LoadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);

export const WorkflowToolbar: React.FC<Props> = ({ onLoad, onOpenLibrary }) => {
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

    return (
        <div className="absolute top-6 left-6 z-30 glass-panel rounded-full p-1.5 flex flex-col items-center space-y-2 animate-in slide-in-from-left-10 duration-500">
            <button
                onClick={onOpenLibrary}
                className="p-3 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-all hover:scale-110 hover:shadow-[0_0_10px_rgba(0,243,255,0.3)]"
                title="Asset Library"
            >
                <LibraryIcon />
            </button>
            <div className="w-8 h-px bg-white/10"></div>
            <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-all hover:scale-110 hover:shadow-[0_0_10px_rgba(188,19,254,0.3)]"
                title="Load from File"
            >
                <LoadIcon />
            </button>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileLoad}
                className="hidden"
                accept=".json"
            />
        </div>
    );
};