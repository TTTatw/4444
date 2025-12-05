
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
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-5xl z-30 glass-panel border border-white/5 rounded-2xl backdrop-blur-md shadow-2xl">
            <div className="flex items-center space-x-2 p-1.5 overflow-x-auto custom-scrollbar min-h-[60px]">
                <div className="flex-shrink-0 pl-1">
                    <button
                        onClick={onClearAll}
                        className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-all border border-white/5 hover:border-red-500/30"
                        title="Clear bar (仅清空底部，不影响数据库)"
                    >
                        <TrashIcon />
                    </button>
                </div>
                <div className="w-px h-6 bg-white/10 flex-shrink-0"></div>
                {history.length === 0 ? (
                    <div className="text-xs text-slate-500 italic px-2">暂无近期历史，生成后会显示。</div>
                ) : (
                    history.map(item => (
                        <div
                            key={item.id}
                            className="group relative flex-shrink-0 w-12 h-12 bg-black/40 rounded-lg overflow-hidden cursor-pointer border border-white/5 hover:border-neon-blue/50 transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
                            onClick={() => onSelect(item)}
                        >
                            <img
                                src={item.image.startsWith('http') ? item.image : `data:image/png;base64,${item.image}`}
                                alt={item.nodeName}
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                                <p className="text-white text-[9px] font-mono leading-tight truncate w-full">
                                    {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteItem(item.id);
                                }}
                                className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center bg-black/60 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                                title="Delete"
                            >
                                <XIcon />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
