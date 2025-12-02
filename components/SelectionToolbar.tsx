import React from 'react';

interface Props {
    position: { top: number; left: number };
    onGroup: () => void;
    onUngroup: () => void;
    selectionType: 'nodes' | 'groups' | 'mixed' | 'none';
}

const GroupIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>);
const UngroupIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h1.5a2.5 2.5 0 0 1 2.5 2.5V9" strokeDasharray="3 3" /><path d="M21 15v1.5a2.5 2.5 0 0 1-2.5 2.5H15" strokeDasharray="3 3" /><path d="M9 21H7.5A2.5 2.5 0 0 1 5 18.5V15" strokeDasharray="3 3" /><path d="M3 9V7.5A2.5 2.5 0 0 1 5.5 5H9" strokeDasharray="3 3" /></svg>);

export const SelectionToolbar: React.FC<Props> = ({ position, onGroup, onUngroup, selectionType }) => {
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 50,
    };

    if (selectionType === 'none') return null;

    return (
        <div style={style} className="glass-panel bg-slate-900/80 rounded-full p-1.5 flex items-center space-x-1 animate-in zoom-in duration-200">
            {(selectionType === 'nodes' || selectionType === 'mixed') && (
                <button
                    onClick={onGroup}
                    className="flex items-center justify-center w-8 h-8 text-slate-200 hover:text-white hover:bg-white/10 rounded-full transition-all border border-cyan-500/30 hover:border-cyan-400 hover:shadow-[0_0_10px_rgba(0,243,255,0.3)]"
                    title="合并"
                >
                    <GroupIcon />
                </button>
            )}
            {(selectionType === 'groups' || selectionType === 'mixed') && (
                <button
                    onClick={onUngroup}
                    className="flex items-center justify-center w-8 h-8 text-slate-200 hover:text-white hover:bg-white/10 rounded-full transition-all border border-cyan-500/30 hover:border-cyan-400 hover:shadow-[0_0_10px_rgba(188,19,254,0.3)]"
                    title="解组"
                >
                    <UngroupIcon />
                </button>
            )}
        </div>
    );
};