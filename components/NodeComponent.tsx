import React, { useState, useRef, MouseEvent, ChangeEvent, useEffect } from 'react';
import type { Node, NodeType } from '../types';
import { fileToBase64 } from '../services/geminiService';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, MAX_NODE_HEIGHT, MAX_NODE_WIDTH } from '../constants';
import { BatchNodeComponent } from './BatchNodeComponent';

interface NodeProps {
    node: Node;
    onDataChange: (id: string, data: Partial<Node>) => void;
    onConnectorMouseDown: (e: React.MouseEvent, nodeId: string, type: 'input' | 'output') => void;
    onConnectorMouseUp: (nodeId: string, type: 'input' | 'output') => void;
    onMouseDown: (nodeId: string, e: MouseEvent) => void;
    onHeaderMouseDown: (nodeId: string, e: MouseEvent<HTMLElement>) => void;
    onViewContent: (type: NodeType, content: string, name: string) => void;
    isGenerated: boolean;
    onContextMenu?: (nodeId: string, e: React.MouseEvent) => void;
    isBatchProcessing?: boolean;
    isOwner?: boolean;
    onRetryItem?: (nodeId: string, itemId: string) => void;
}

const UploadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);

export const NodeComponent: React.FC<NodeProps> = React.memo(({ node, onDataChange, onConnectorMouseDown, onConnectorMouseUp, onMouseDown, onHeaderMouseDown, onViewContent, isGenerated, onContextMenu, isBatchProcessing = false, isOwner = true, onRetryItem }) => {
    const [isNameEditing, setIsNameEditing] = useState(false);
    const [isContentEditing, setIsContentEditing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (node.type === 'image' && node.inputImage && (!node.width || !node.height)) {
            const img = new Image();
            img.onload = () => {
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                let newWidth = img.naturalWidth;
                let newHeight = img.naturalHeight;

                // User request: Use default node length (320) as the max length for the longest side
                const MAX_SIDE = DEFAULT_NODE_WIDTH;

                if (newWidth > newHeight) {
                    // Landscape
                    if (newWidth > MAX_SIDE) {
                        newWidth = MAX_SIDE;
                        newHeight = newWidth / aspectRatio;
                    }
                } else {
                    // Portrait or Square
                    if (newHeight > MAX_SIDE) {
                        newHeight = MAX_SIDE;
                        newWidth = newHeight * aspectRatio;
                    }
                }
                onDataChange(node.id, { width: newWidth, height: newHeight });
            };
            // Handle both Base64 and URL
            if (node.inputImage.startsWith('http')) {
                img.crossOrigin = "Anonymous"; // Important for CORS
                img.src = node.inputImage;
            } else {
                img.src = `data:image/png;base64,${node.inputImage}`;
            }
        } else if (node.type === 'text' && (node.width || node.height)) {
            onDataChange(node.id, { width: undefined, height: undefined });
        }
    }, [node.id, node.type, node.inputImage, node.width, node.height, onDataChange]);


    const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        // if (!isOwner) return; // Allow non-owners to upload
        const file = e.target.files?.[0];
        if (file) {
            const base64 = await fileToBase64(file);
            // IMPORTANT: Reset status to 'idle' so the runner knows this is fresh user input, not stale output.
            // When uploading new input, clear previous outputImage
            onDataChange(node.id, { inputImage: base64, outputImage: undefined, content: file.name, status: 'idle', width: undefined, height: undefined });
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        // if (!isOwner || isGenerated) return; // Allow non-owners to paste
        // if (!isOwner || isGenerated) return; // Allow non-owners to paste
        if (isGenerated && node.type !== 'batch-image') return;

        // Handle Image Node Paste
        if (node.type === 'image') {
            let handled = false;
            for (const item of e.clipboardData.items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        e.stopPropagation();
                        const base64 = await fileToBase64(file);
                        // IMPORTANT: Reset status to 'idle' so the runner knows this is fresh user input.
                        // When pasting new input, clear previous outputImage
                        onDataChange(node.id, { inputImage: base64, outputImage: undefined, content: "pasted_image", status: 'idle', width: undefined, height: undefined });
                        handled = true;
                        break; // Stop after finding the first image
                    }
                }
            }
            if (!handled) {
                const text = e.clipboardData.getData('text');
                if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDataChange(node.id, { inputImage: text, content: "pasted_url", status: 'idle', width: undefined, height: undefined });
                }
            }
        }
        // Handle Batch Image Node Paste
        else if (node.type === 'batch-image') {
            e.preventDefault();
            e.stopPropagation();

            const newItems: any[] = [];

            // Priority 1: Check for Files (better for multi-select copy/paste)
            if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                const files = Array.from(e.clipboardData.files);
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        const base64 = await fileToBase64(file);
                        newItems.push({
                            id: `item-${Date.now()}-${Math.random()}`,
                            source: base64,
                            status: 'idle'
                        });
                    }
                }
            }
            // Priority 2: Check for Items (fallback for some contexts)
            else {
                const items = Array.from(e.clipboardData.items);
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (file) {
                            const base64 = await fileToBase64(file);
                            newItems.push({
                                id: `item-${Date.now()}-${Math.random()}`,
                                source: base64,
                                status: 'idle'
                            });
                        }
                    }
                }
            }

            if (newItems.length > 0) {
                const currentItems = node.batchItems || [];
                if (currentItems.length + newItems.length > 9) {
                    alert('最多只能添加 9 张图片');
                    return;
                }
                onDataChange(node.id, { batchItems: [...currentItems, ...newItems] });
            }
        }
    };

    const isImageNode = node.type === 'image';
    const isBatchNode = node.type === 'batch-image';
    const isError = node.status === 'error';
    const isRunning = node.status === 'running';

    const nodeStyle: React.CSSProperties = {
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.width || DEFAULT_NODE_WIDTH,
        height: node.height || DEFAULT_NODE_HEIGHT,
        zIndex: node.selected ? 1000 : 1,
    };

    const renderContent = () => {
        if (isBatchNode) {
            return (
                <BatchNodeComponent
                    node={node}
                    onDataChange={onDataChange}
                    isOwner={isOwner}
                    onRetryItem={onRetryItem}
                    onViewContent={onViewContent}
                />
            );
        }

        if (isImageNode) {
            // Case 1: Has image (input or output)
            const displayImage = node.outputImage || node.inputImage;

            if (displayImage) {
                const imgSrc = displayImage.startsWith('http')
                    ? displayImage
                    : `data:image/png;base64,${displayImage}`;
                return (
                    <div className="relative h-full w-full group/image-content rounded-xl overflow-hidden">
                        <div className="h-full w-full flex items-center justify-center bg-black/20">
                            <img
                                src={imgSrc}
                                alt={node.content}
                                className="max-h-full max-w-full object-contain"
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    onViewContent(node.type, displayImage!, node.name);
                                }}
                            />
                        </div>
                        {/* Overlay to change image for non-generated nodes */}
                        {!isGenerated && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/image-content:opacity-100 transition-opacity flex flex-col items-center justify-center pointer-events-none">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fileInputRef.current?.click();
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex items-center space-x-1 bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded-full pointer-events-auto backdrop-blur-md border border-white/10"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    <span>更换</span>
                                </button>
                            </div>
                        )}
                    </div>
                );
            }
            // Case 2: No image, is a user-input node -> show upload placeholder
            if (!isGenerated) {
                return (
                    <div className={`w-full h-full flex flex-col items-center justify-center text-center p-2 border border-dashed border-white/10 rounded-xl bg-white/5 transition-colors cursor-default`}>
                        <div
                            className="p-2 bg-white/5 rounded-full text-neon-blue mb-2 shadow-[0_0_15px_rgba(0,243,255,0.2)] cursor-pointer hover:bg-white/10 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <UploadIcon />
                        </div>
                        <p
                            className="text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                            }}
                            onMouseDown={(e) => {
                                // Do NOT stop propagation so the parent can focus
                                // Or manually focus:
                                // (e.currentTarget.closest('[tabindex]') as HTMLElement)?.focus();
                                // Actually, letting it bubble to parent onMouseDown is better.
                                // But parent onMouseDown calls onMouseDown prop which selects the node.
                                // If we stop prop, we must handle selection/focus here.
                                const nodeEl = document.getElementById(node.id);
                                nodeEl?.focus();
                                // We still stop prop to prevent dragging? No, onMouseDown usually starts drag.
                                // If we want to allow drag, we shouldn't stop prop.
                                // But this is a button-like element.
                                e.stopPropagation();
                                onMouseDown(node.id, e); // Select node
                            }}
                        >
                            上传/粘贴
                        </p>
                    </div>
                );
            }
            // Case 3: No image, is a generated node -> show placeholder or text output
            if (node.content && node.content !== '生成图片') {
                return (
                    <div className="text-xs text-slate-300 bg-black/20 p-2 rounded-xl w-full h-full overflow-y-auto custom-scrollbar font-mono">
                        <p className="whitespace-pre-wrap break-words">{node.content}</p>
                    </div>
                );
            }
            // Placeholder for generated image node
            return (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 text-slate-500 border border-dashed border-white/10 rounded-xl bg-black/20">
                    <div className={`text-xs ${isRunning ? "animate-pulse text-neon-blue" : ""}`}>
                        {isRunning ? '生成中...' : '等待生成'}
                    </div>
                </div>
            );
        }

        // Text Node
        const placeholderText = isGenerated
            ? (isRunning ? '生成中...' : '等待生成')
            : '请输入...';

        return (
            <div
                className="w-full h-full bg-black/20 rounded-xl border border-white/5 relative overflow-hidden"
                onDoubleClick={() => setIsContentEditing(true)}
            >
                {isContentEditing ? (
                    <textarea
                        value={node.content}
                        onChange={(e) => onDataChange(node.id, { content: e.target.value })}
                        onBlur={() => setIsContentEditing(false)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={placeholderText}
                        className="w-full h-full bg-transparent text-slate-200 p-2 text-xs resize-none focus:outline-none placeholder:text-slate-600 custom-scrollbar font-mono leading-relaxed"
                        autoFocus
                    />
                ) : (
                    <div className={`w-full h-full text-slate-200 p-2 text-xs overflow-y-auto custom-scrollbar font-mono leading-relaxed ${!node.content ? 'flex items-center justify-center text-center' : ''}`}>
                        <p className="whitespace-pre-wrap break-words w-full">
                            {node.content || <span className={`text-slate-600 italic ${isRunning ? 'text-neon-blue animate-pulse' : ''}`}>{placeholderText}</span>}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            id={node.id}
            data-is-node="true"
            style={nodeStyle}
            tabIndex={-1} // Allow div to receive focus for paste events
            className={`group/node absolute outline-none pointer-events-auto`}
            onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                // Only focus if not clicking an input/textarea to avoid stealing focus
                if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                    e.currentTarget.focus();
                }
                onMouseDown(node.id, e);
            }}
            // Add onFocus to ensure we know when it's ready for paste
            onFocus={(e) => {
                // Optional: visual feedback or state tracking if needed
            }}
            onPaste={handlePaste}
            onContextMenu={(e) => {
                e.stopPropagation(); // Stop bubbling to prevent canvas context menu
                if (onContextMenu) {
                    onContextMenu(node.id, e);
                }
            }}
        >


            {/* Main Card Content */}
            <div className={`relative w-full h-full flex flex-col rounded-2xl glass-card z-10 transition-all duration-200 ${node.selected ? 'ring-1 ring-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.3)]' : ''} ${isRunning ? 'ring-1 ring-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.5)]' : ''}`}>
                <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-full flex items-center justify-center"
                    onMouseDown={(e) => {
                        // Ensure focus when clicking header, as the handler might stop propagation
                        (e.currentTarget.closest('[tabindex]') as HTMLElement)?.focus();
                        onHeaderMouseDown(node.id, e);
                    }}
                    onDoubleClick={(e) => { e.stopPropagation(); setIsNameEditing(true); }}
                >
                    <div className="relative flex justify-center min-w-[100px]">
                        {isNameEditing ? (
                            <input
                                type="text"
                                defaultValue={node.name}
                                onBlur={(e) => { onDataChange(node.id, { name: e.target.value }); setIsNameEditing(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                className="bg-black/50 text-center text-xs font-bold text-white p-1.5 rounded-lg w-full focus:outline-none border border-neon-blue/50 shadow-[0_0_10px_rgba(0,243,255,0.2)] backdrop-blur-md"
                                autoFocus
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <h3
                                className={`font-bold text-xs text-slate-300 select-none truncate text-center px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/5 transition-all cursor-move shadow-lg flex items-center gap-1 justify-center`}
                            >
                                {node.name}
                            </h3>
                        )}
                    </div>
                </div>

                <div className="w-full h-full overflow-hidden rounded-xl relative p-1">
                    {renderContent()}
                    {isError && (
                        <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 backdrop-blur-md border-t border-red-500/50 text-red-200 text-xs p-3 pointer-events-none max-h-[50%] overflow-hidden rounded-b-xl">
                            <p className="font-bold mb-1 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                Error
                            </p>
                            <div className="max-h-20 overflow-y-auto custom-scrollbar opacity-80">
                                <p className="whitespace-pre-wrap break-words font-mono">{node.content}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Connector (Left) - Hidden for Merged Mode */}
                {(!isBatchNode || (node.batchMode || 'independent') !== 'merged') && (
                    <div
                        className={`absolute left-[-6px] top-1/2 -translate-y-1/2 w-3 h-6 bg-slate-700 rounded-r-none rounded-l-sm cursor-pointer flex items-center justify-center transition-all z-10
                                hover:scale-125 hover:bg-neon-blue hover:shadow-[0_0_10px_rgba(0,243,255,0.5)]
                                group-hover/node:opacity-100 opacity-0`}
                        style={{ left: -12, width: 12, height: 24, borderRadius: '4px 0 0 4px' }}
                        title="Input"
                        data-connector="true"
                        onMouseDown={(e) => { e.stopPropagation(); onConnectorMouseDown(e, node.id, 'input'); }}
                        onMouseUp={(e) => { e.stopPropagation(); onConnectorMouseUp(node.id, 'input'); }}
                    >
                        <div className="w-1 h-3 bg-black/30 rounded-full"></div>
                    </div>
                )}

                {/* Output Connector (Right) - Hidden for Independent Mode */}
                {(!isBatchNode || (node.batchMode || 'independent') !== 'independent') && (
                    <div
                        className={`absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-6 bg-slate-700 rounded-l-none rounded-r-sm cursor-pointer flex items-center justify-center transition-all z-10
                                hover:scale-125 hover:bg-neon-purple hover:shadow-[0_0_10px_rgba(188,19,254,0.5)]
                                group-hover/node:opacity-100 opacity-0`}
                        style={{ right: -12, width: 12, height: 24, borderRadius: '0 4px 4px 0' }}
                        title="Output"
                        data-connector="true"
                        onMouseDown={(e) => { e.stopPropagation(); onConnectorMouseDown(e, node.id, 'output'); }}
                        onMouseUp={(e) => { e.stopPropagation(); onConnectorMouseUp(node.id, 'output'); }}
                    >
                        <div className="w-1 h-3 bg-black/30 rounded-full"></div>
                    </div>
                )}

                {/* Hidden file input for image nodes that are user-editable */}
                {isImageNode && !isGenerated && (
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
                )}
            </div>
        </div>
    );
});
