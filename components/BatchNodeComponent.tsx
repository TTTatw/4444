import React, { useRef, ChangeEvent } from 'react';
import { Node, BatchItem, BatchMode, NodeType } from '../types';
import { fileToBase64 } from '../services/geminiService';

interface BatchNodeComponentProps {
    node: Node;
    onDataChange: (id: string, data: Partial<Node>) => void;
    isOwner?: boolean;
    onRetryItem?: (nodeId: string, itemId: string) => void;
    onViewContent?: (type: NodeType, content: string, name: string) => void;
}

export const BatchNodeComponent: React.FC<BatchNodeComponentProps> = ({ node, onDataChange, isOwner = true, onRetryItem, onViewContent }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const newItems: BatchItem[] = [];
        for (let i = 0; i < e.target.files.length; i++) {
            const file = e.target.files[i];
            const base64 = await fileToBase64(file);
            newItems.push({
                id: `item-${Date.now()}-${i}`,
                source: base64,
                status: 'idle'
            });
        }

        const currentItems = node.batchItems || [];
        if (currentItems.length + newItems.length > 9) {
            alert('最多只能添加 9 张图片');
            return;
        }

        onDataChange(node.id, { batchItems: [...currentItems, ...newItems] });
    };

    const handleDeleteItem = (itemId: string) => {
        const currentItems = node.batchItems || [];
        onDataChange(node.id, { batchItems: currentItems.filter(i => i.id !== itemId) });
    };



    const handleRetryClick = (itemId: string) => {
        // Reset status to idle and result to undefined, then trigger retry callback
        const currentItems = node.batchItems || [];
        onDataChange(node.id, {
            batchItems: currentItems.map(i => i.id === itemId ? { ...i, result: undefined, status: 'idle' } : i)
        });
        if (onRetryItem) {
            onRetryItem(node.id, itemId);
        }
    };

    const items = node.batchItems || [];

    // Dynamic Sizing Logic
    React.useEffect(() => {
        const count = items.length;
        let newWidth = 134;
        let newHeight = 134;

        if (count > 0) {
            if (count < 4) {
                // Row layout: 1-3 items
                // Width grows: 1->134, 2->276 (134*2+8), 3->300 (max)
                if (count === 1) newWidth = 134;
                else if (count === 2) newWidth = 260; // Adjusted from 276 to match content height (118*2 + 8 + 16 = 260)
                else newWidth = 300;

                newHeight = 134;
            } else if (count === 4) {
                // 2x2 Grid
                newWidth = 276; // 134*2 + 8
                newHeight = 276;
            } else {
                // 3x3 Grid (5-9 items)
                newWidth = 300;
                // Height depends on rows? 
                // 5-6 items = 2 rows = 200px? No, 300px width means items are smaller (~95px).
                // 300px width / 3 cols = 100px per col (including gap).
                // So height should be ~200px for 2 rows, ~300px for 3 rows.
                // Let's just stick to square for simplicity or auto-height?
                // Node height is explicit.
                // If width is 300, items are ~95px.
                // 2 rows = 95*2 + 8 = 198.
                // 3 rows = 95*3 + 16 = 301.
                newHeight = count <= 6 ? 200 : 300;
            }
        }

        // Add extra height for the "Add" button at the bottom (approx 30px + gap)
        if (items.length < 9) {
            newHeight += 40;
        }

        if (node.width !== newWidth || node.height !== newHeight) {
            onDataChange(node.id, { width: newWidth, height: newHeight });
        }
    }, [items.length, node.width, node.height, onDataChange, node.id]);

    let layoutClass = '';
    if (items.length < 4) {
        layoutClass = 'flex flex-row space-x-2 overflow-x-auto';
    } else if (items.length === 4) {
        layoutClass = 'grid grid-cols-2 gap-2';
    } else {
        layoutClass = 'grid grid-cols-3 gap-2';
    }

    // Empty State (Match NodeComponent)
    if (items.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 border border-dashed border-white/10 rounded-xl bg-white/5 transition-colors cursor-default">
                <div
                    className="p-2 bg-white/5 rounded-full text-neon-blue mb-2 shadow-[0_0_15px_rgba(0,243,255,0.2)] cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </div>
                <p
                    className="text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                >
                    上传/粘贴
                </p>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept="image/*"
                    onChange={handleUpload}
                />
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            {/* Content Area */}
            <div className={`flex-1 p-2 ${layoutClass} min-h-0 overflow-y-auto custom-scrollbar`}>
                {items.map(item => (
                    <div
                        key={item.id}
                        className="relative group aspect-square bg-black/30 rounded overflow-hidden border border-white/10"
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (onViewContent) {
                                onViewContent('image', item.result || item.source, 'Batch Item');
                            }
                        }}
                    >
                        {/* Image Display: Prioritize Result, fallback to Source */}
                        <img
                            src={(item.result || item.source || '').startsWith('http') || (item.result || item.source || '').startsWith('data:')
                                ? (item.result || item.source)
                                : `data:image/png;base64,${item.result || item.source}`}
                            className="w-full h-full object-cover"
                            alt="batch item"
                        />

                        {/* Loading Spinner */}
                        {item.status === 'running' && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                                <div className="w-6 h-6 border-2 border-neon-blue border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}

                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            {/* Retry only if status is not idle */}
                            {item.status !== 'idle' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRetryClick(item.id); }}
                                    className="px-2 py-1 bg-green-600/80 rounded text-xs text-white hover:bg-green-500"
                                >
                                    重试
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                className="px-2 py-1 bg-red-600/80 rounded text-xs text-white hover:bg-red-500"
                            >
                                删除
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Button - Narrower Bar at Bottom */}
            {items.length < 9 && (
                <div className="px-2 pb-2">
                    <div
                        className="w-full h-8 bg-white/5 rounded border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 gap-1 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <span className="text-lg text-white/50 leading-none">+</span>
                        <span className="text-[10px] text-white/50">添加图片</span>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/*"
                onChange={handleUpload}
            />
        </div>
    );
};
