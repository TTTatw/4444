
import React from 'react';

interface Props {
    position: { top: number; left: number };
    onGroup: () => void;
    onUngroup: () => void;
    selectionType: 'node' | 'group';
}

const GroupIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>);
const UngroupIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h1.5a2.5 2.5 0 0 1 2.5 2.5V9" strokeDasharray="3 3" /><path d="M21 15v1.5a2.5 2.5 0 0 1-2.5 2.5H15" strokeDasharray="3 3" /><path d="M9 21H7.5A2.5 2.5 0 0 1 5 18.5V15" strokeDasharray="3 3" /><path d="M3 9V7.5A2.5 2.5 0 0 1 5.5 5H9" strokeDasharray="3 3" /></svg>);

export const SelectionToolbar: React.FC<Props> = ({ position, onGroup, onUngroup, selectionType }) => {
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 30,
    };

    return (
        <div style={style} className="glass-panel rounded-full p-1.5 flex items-center space-x-1 animate-in zoom-in duration-200">
            {selectionType === 'node' && (
                <button
                    onClick={onGroup}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-all hover:shadow-[0_0_10px_rgba(0,243,255,0.3)]"
                    title="Group Selection"
                >
                    <GroupIcon />
                </button>
            )}
            {selectionType === 'group' && (
                <button
                    onClick={onUngroup}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-all hover:shadow-[0_0_10px_rgba(188,19,254,0.3)]"
                    title="Ungroup"
                >
                    <UngroupIcon />
                </button>
            )}
        </div>
    );
};