
import React from 'react';
import type { HistoryItem } from '../types';

interface Props {
    history: HistoryItem[];
    onSelect: (item: HistoryItem) => void;
    onClearAll: () => void;
    onDeleteItem: (id: string) => void;
}

const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>);
const XIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);

export const HistoryTray: React.FC<Props> = ({ history, onSelect, onClearAll, onDeleteItem }) => {
    if (history.length === 0) {
        return null;
    }

    return (
        <div className="absolute bottom-0 left-0 right-0 z-30 glass-panel border-t border-white/5 animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex items-center space-x-3 p-3 overflow-x-auto custom-scrollbar">
                <div className="flex-shrink-0 pl-1">
                    <button
                        onClick={onClearAll}
                        className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all border border-white/5 hover:border-red-500/30"
                        title="Clear History"
                    >
                        <TrashIcon />
                    </button>
                </div>
                <div className="w-px h-12 bg-white/10 flex-shrink-0"></div>
                {history.map(item => (
                    <div
                        key={item.id}
                        className="group relative flex-shrink-0 w-24 h-24 bg-black/40 rounded-xl overflow-hidden cursor-pointer border border-white/5 hover:border-neon-blue/50 transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
                        onClick={() => onSelect(item)}
                    >
                        <img
                            src={`data:image/png;base64,${item.image}`}
                            alt={item.nodeName}
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                            <p className="text-white text-[10px] font-mono leading-tight truncate w-full">
                                {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem(item.id);
                            }}
                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                            title="Delete"
                        >
                            <XIcon />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
