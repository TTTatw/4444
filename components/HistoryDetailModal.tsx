
import React, { useEffect, useCallback } from 'react';
import type { HistoryItem } from '../types';

interface Props {
    item: HistoryItem;
    onClose: () => void;
}

export const HistoryDetailModal: React.FC<Props> = ({ item, onClose }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleDownload = useCallback(() => {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${item.image}`;
        link.download = `${item.nodeName.replace(/\s+/g, '_') || 'history_image'}.png`;
        link.click();
    }, [item.image, item.nodeName]);

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="bg-[#2d2d2d] border border-slate-700 max-w-6xl w-full max-h-[90vh] rounded-lg shadow-2xl flex"
                onClick={e => e.stopPropagation()}
            >
                {/* Image Panel */}
                <div className="flex-1 flex items-center justify-center p-4 bg-black/20">
                    <img src={`data:image/png;base64,${item.image}`} alt={item.nodeName} className="max-w-full max-h-full object-contain rounded-md" />
                </div>

                {/* Info Panel */}
                <div className="w-1/3 flex flex-col border-l border-slate-700">
                    <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-slate-700">
                        <h2 className="text-lg font-semibold text-slate-200">{item.nodeName}</h2>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                            aria-label="Close viewer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="flex-grow p-4 overflow-y-auto custom-scrollbar space-y-4">
                        <div>
                            <h3 className="text-xs text-slate-400 font-semibold mb-1">生成时间</h3>
                            <p className="text-sm text-slate-200">{item.timestamp.toLocaleString()}</p>
                        </div>
                        <div>
                            <h3 className="text-xs text-slate-400 font-semibold mb-1">提示词</h3>
                            <p className="text-sm text-slate-200 bg-slate-800/50 p-2 rounded-md whitespace-pre-wrap break-words">{item.prompt || '无'}</p>
                        </div>
                        <div>
                            <h3 className="text-xs text-slate-400 font-semibold mb-1">上下文</h3>
                            <p className="text-sm text-slate-200 bg-slate-800/50 p-2 rounded-md whitespace-pre-wrap break-words">{item.context || '无'}</p>
                        </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center justify-end p-3 border-t border-slate-700">
                        <button
                            onClick={handleDownload}
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-semibold text-white"
                        >
                            下载图片
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
