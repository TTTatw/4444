
import React, { useEffect, useCallback } from 'react';
import type { NodeType } from '../types';

interface ViewerModalProps {
    content: string;
    type: NodeType;
    name: string;
    onClose: () => void;
}

export const ViewerModal: React.FC<ViewerModalProps> = ({ content, type, name, onClose }) => {
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);
    
    const handleDownload = useCallback(() => {
        if (type !== 'image') return;
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${content}`;
        link.download = `${name.replace(/\s+/g, '_') || 'generated_image'}.png`;
        link.click();
    }, [content, type, name]);

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog" aria-modal="true" aria-labelledby="viewer-title"
        >
            <div 
                className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 w-full h-full max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/10">
                    <h2 id="viewer-title" className="text-lg font-semibold text-slate-100">{name}</h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                        aria-label="Close viewer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-grow p-2 sm:p-4 overflow-auto custom-scrollbar min-h-0">
                    {type === 'image' ? (
                        <div className="flex justify-center items-center h-full">
                            <img src={`data:image/png;base64,${content}`} alt={name} className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <pre className="text-slate-200 text-base whitespace-pre-wrap font-sans p-2">{content}</pre>
                    )}
                </div>

                {type === 'image' && (
                    <div className="flex-shrink-0 flex items-center justify-end p-3 border-t border-white/10">
                         <button 
                            onClick={handleDownload}
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-semibold text-white"
                         >
                           下载图片
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
