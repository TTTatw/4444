import React, { useState, ChangeEvent, useEffect, useRef } from 'react';
import type { Node } from '../types';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../constants';
import { fileToBase64 } from '../services/geminiService';
import { handleClipboardPaste } from '../utils/clipboardUtils';

interface InstructionInputProps {
    node: Node;
    onDataChange: (id: string, data: Partial<Node>) => void;
    onExecute: (nodeId: string, instruction: string) => void;
    isOwner?: boolean;
}

const RunIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
);

export const InstructionInput: React.FC<InstructionInputProps> = ({ node, onDataChange, onExecute, isOwner = true }) => {
    const [instruction, setInstruction] = useState(node.instruction);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // const isLocked = node.locked; // Deprecated in favor of isOwner

    // Sync local state if the active node changes
    useEffect(() => {
        setInstruction(node.instruction);
    }, [node.id, node.instruction]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [instruction]);

    const handleInstructionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        if (!isOwner) return;
        const newInstruction = e.target.value;
        setInstruction(newInstruction);
        onDataChange(node.id, { instruction: newInstruction });
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        // if (!isOwner) return; // Allow non-owners to change model
        onDataChange(node.id, { selectedModel: e.target.value });
    };

    const handleExecute = () => {
        if (node.status === 'running') return;
        onExecute(node.id, instruction);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleExecute();
            textareaRef.current?.blur();
        }
    };

    const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!isOwner) return;

        const results = await handleClipboardPaste(e);

        if (results.length > 0) {
            e.preventDefault();
            e.stopPropagation();
        } else {
            return;
        }

        const firstImage = results.find(r => r.type === 'image');
        if (firstImage) {
            // Update inputImage and reset status to idle
            // Also clear outputImage to avoid confusion
            onDataChange(node.id, {
                inputImage: firstImage.content,
                outputImage: undefined,
                status: 'idle',
                content: node.type === 'image' && firstImage.filename ? firstImage.filename : node.content
            });
            return;
        }
    };

    const nodeHeight = node.height || DEFAULT_NODE_HEIGHT;
    const nodeWidth = node.width || DEFAULT_NODE_WIDTH;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: `${node.position.y + nodeHeight + 12}px`,
        left: `${node.position.x + nodeWidth / 2}px`,
        transform: 'translateX(-50%)',
        width: '500px',
        zIndex: 20,
    };

    const currentModel = node.selectedModel || (['image', 'batch-image'].includes(node.type) ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview');

    return (
        <div
            style={containerStyle}
            className="pointer-events-auto"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="glass-panel rounded-2xl p-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="relative bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                    <textarea
                        ref={textareaRef}
                        placeholder={!isOwner ? '不可修改' : 'Enter instructions...'}
                        value={!isOwner ? '' : instruction}
                        onChange={handleInstructionChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        readOnly={!isOwner}
                        className={`w-full bg-transparent text-slate-200 p-3 text-sm resize-none focus:outline-none placeholder:text-slate-600 max-h-40 custom-scrollbar font-mono leading-relaxed ${!isOwner ? 'cursor-not-allowed text-slate-500' : ''}`}
                        rows={1}
                    />
                    {/* Removed Lock Icon as per request */}
                    <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                </div>

                <div className="flex flex-col gap-2 mt-1.5 px-1">
                    {/* Settings Row */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/5 cursor-help transition-colors hover:bg-white/10 overflow-x-auto custom-scrollbar max-w-[calc(100%-40px)]">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${node.type === 'text' ? 'bg-neon-blue' : 'bg-neon-purple'} shadow-[0_0_5px_currentColor]`}></div>

                            {/* Batch Image Node Controls */}
                            {node.type === 'batch-image' ? (
                                <div className="flex items-center gap-2">
                                    {/* Mode Switcher Capsule */}
                                    <div className="flex items-center bg-black/40 rounded-full p-0.5 border border-white/10">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDataChange(node.id, { batchMode: 'independent' }); }}
                                            className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${node.batchMode !== 'merged' ? 'bg-neon-blue text-white shadow-[0_0_10px_rgba(0,243,255,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            输出
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDataChange(node.id, { batchMode: 'merged' }); }}
                                            className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${node.batchMode === 'merged' ? 'bg-neon-purple text-white shadow-[0_0_10px_rgba(188,19,254,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            输入
                                        </button>
                                    </div>

                                    <div className="w-[1px] h-3 bg-white/10 mx-1"></div>

                                    <select
                                        value={currentModel}
                                        onChange={handleModelChange}
                                        className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <option value="gemini-3-pro-image-preview" className="bg-slate-800 text-slate-200">Nano Pro (3.0)</option>
                                        <option value="gemini-2.5-flash-image" className="bg-slate-800 text-slate-200">Nano Fast (2.5)</option>
                                    </select>

                                    {(currentModel === 'gemini-3-pro-image-preview' || currentModel === 'gemini-2.5-flash-image') && (
                                        <select
                                            value={node.aspectRatio || ''}
                                            onChange={(e) => onDataChange(node.id, { aspectRatio: e.target.value || undefined })}
                                            className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed border-l border-white/10 pl-2"
                                            onClick={e => e.stopPropagation()}
                                            onMouseDown={e => e.stopPropagation()}
                                            title="纵横比"
                                        >
                                            <option value="" className="bg-slate-800 text-slate-200">默认比例</option>
                                            <option value="1:1" className="bg-slate-800 text-slate-200">1:1 (方图)</option>
                                            <option value="2:3" className="bg-slate-800 text-slate-200">2:3 (竖屏)</option>
                                            <option value="3:2" className="bg-slate-800 text-slate-200">3:2 (横屏)</option>
                                            <option value="3:4" className="bg-slate-800 text-slate-200">3:4 (竖屏)</option>
                                            <option value="4:3" className="bg-slate-800 text-slate-200">4:3 (横屏)</option>
                                            <option value="4:5" className="bg-slate-800 text-slate-200">4:5 (竖屏)</option>
                                            <option value="5:4" className="bg-slate-800 text-slate-200">5:4 (横屏)</option>
                                            <option value="9:16" className="bg-slate-800 text-slate-200">9:16 (手机)</option>
                                            <option value="16:9" className="bg-slate-800 text-slate-200">16:9 (电脑)</option>
                                            <option value="21:9" className="bg-slate-800 text-slate-200">21:9 (宽屏)</option>
                                        </select>
                                    )}

                                    {/* Resolution Selector - Only for Pro (Aligned with Image Node) */}
                                    {currentModel === 'gemini-3-pro-image-preview' && (
                                        <select
                                            value={node.resolution || ''}
                                            onChange={(e) => onDataChange(node.id, { resolution: e.target.value || undefined })}
                                            className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed border-l border-white/10 pl-2"
                                            onClick={e => e.stopPropagation()}
                                            onMouseDown={e => e.stopPropagation()}
                                            title="分辨率"
                                        >
                                            <option value="" className="bg-slate-800 text-slate-200">默认分辨率</option>
                                            <option value="1K" className="bg-slate-800 text-slate-200">1K (标准)</option>
                                            <option value="2K" className="bg-slate-800 text-slate-200">2K (高清)</option>
                                            <option value="4K" className="bg-slate-800 text-slate-200">4K (超清)</option>
                                        </select>
                                    )}

                                </div>
                            ) : node.type === 'image' ? (
                                <div className="flex items-center gap-2">
                                    <select
                                        value={currentModel}
                                        onChange={handleModelChange}
                                        // disabled={!isOwner} // Allow non-owners
                                        className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <option value="gemini-3-pro-image-preview" className="bg-slate-800 text-slate-200">Nano Pro (3.0)</option>
                                        <option value="gemini-2.5-flash-image" className="bg-slate-800 text-slate-200">Nano Fast (2.5)</option>
                                    </select>

                                    {/* Aspect Ratio Selector - For both image models */}
                                    {(currentModel === 'gemini-3-pro-image-preview' || currentModel === 'gemini-2.5-flash-image') && (
                                        <select
                                            value={node.aspectRatio || ''}
                                            onChange={(e) => onDataChange(node.id, { aspectRatio: e.target.value || undefined })}
                                            // disabled={!isOwner} // Allow non-owners
                                            className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed border-l border-white/10 pl-2"
                                            onClick={e => e.stopPropagation()}
                                            onMouseDown={e => e.stopPropagation()}
                                            title="纵横比"
                                        >
                                            <option value="" className="bg-slate-800 text-slate-200">默认比例</option>
                                            <option value="1:1" className="bg-slate-800 text-slate-200">1:1 (方图)</option>
                                            <option value="2:3" className="bg-slate-800 text-slate-200">2:3 (竖屏)</option>
                                            <option value="3:2" className="bg-slate-800 text-slate-200">3:2 (横屏)</option>
                                            <option value="3:4" className="bg-slate-800 text-slate-200">3:4 (竖屏)</option>
                                            <option value="4:3" className="bg-slate-800 text-slate-200">4:3 (横屏)</option>
                                            <option value="4:5" className="bg-slate-800 text-slate-200">4:5 (竖屏)</option>
                                            <option value="5:4" className="bg-slate-800 text-slate-200">5:4 (横屏)</option>
                                            <option value="9:16" className="bg-slate-800 text-slate-200">9:16 (手机)</option>
                                            <option value="16:9" className="bg-slate-800 text-slate-200">16:9 (电脑)</option>
                                            <option value="21:9" className="bg-slate-800 text-slate-200">21:9 (宽屏)</option>
                                        </select>
                                    )}

                                    {/* Resolution Selector - Only for Pro */}
                                    {currentModel === 'gemini-3-pro-image-preview' && (
                                        <select
                                            value={node.resolution || ''}
                                            onChange={(e) => onDataChange(node.id, { resolution: e.target.value || undefined })}
                                            // disabled={!isOwner} // Allow non-owners
                                            className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed border-l border-white/10 pl-2"
                                            onClick={e => e.stopPropagation()}
                                            onMouseDown={e => e.stopPropagation()}
                                            title="分辨率"
                                        >
                                            <option value="" className="bg-slate-800 text-slate-200">默认分辨率</option>
                                            <option value="1K" className="bg-slate-800 text-slate-200">1K (标准)</option>
                                            <option value="2K" className="bg-slate-800 text-slate-200">2K (高清)</option>
                                            <option value="4K" className="bg-slate-800 text-slate-200">4K (超清)</option>
                                        </select>
                                    )}

                                    {/* Google Search Toggle - Only for Pro */}
                                    {(currentModel === 'gemini-3-pro-image-preview' || currentModel === 'gemini-3-pro-preview') && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // if (!!isOwner) { // Allow non-owners
                                                onDataChange(node.id, { googleSearch: !node.googleSearch });
                                                // }
                                            }}
                                            // disabled={!isOwner} // Allow non-owners
                                            className={`ml-2 p-1 rounded-md transition-colors ${node.googleSearch ? 'bg-neon-blue/20 text-neon-blue' : 'text-slate-500 hover:text-slate-300'}`}
                                            title="Enable Google Search Grounding"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8"></circle>
                                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <select
                                        value={currentModel}
                                        onChange={handleModelChange}
                                        // disabled={!isOwner} // Allow non-owners
                                        className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <option value="gemini-3-pro-preview" className="bg-slate-800 text-slate-200">Gemini 3.0 Pro</option>
                                        <option value="gemini-2.5-flash" className="bg-slate-800 text-slate-200">Gemini 2.5 Flash</option>
                                    </select>

                                    {/* Google Search Toggle - Also for Text Pro */}
                                    {(currentModel === 'gemini-3-pro-preview') && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // if (!!isOwner) { // Allow non-owners
                                                onDataChange(node.id, { googleSearch: !node.googleSearch });
                                                // }
                                            }}
                                            // disabled={!isOwner} // Allow non-owners
                                            className={`ml-2 p-1 rounded-md transition-colors ${node.googleSearch ? 'bg-neon-blue/20 text-neon-blue' : 'text-slate-500 hover:text-slate-300'}`}
                                            title="Enable Google Search Grounding"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8"></circle>
                                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleExecute}
                            disabled={node.status === 'running'}
                            className={`
                                w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-all duration-200
                                ${node.status === 'running'
                                    ? 'bg-slate-700 cursor-not-allowed'
                                    : 'bg-gradient-to-br from-neon-blue to-cosmic-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] hover:scale-105 active:scale-95 text-white'
                                }
                            `}
                            title="Run (Enter)"
                        >
                            {node.status === 'running' ? (
                                <svg className="animate-spin h-4 w-4 text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <RunIcon />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
};
