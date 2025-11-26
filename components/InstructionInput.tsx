import React, { useState, ChangeEvent, useEffect, useRef } from 'react';
import type { Node } from '../types';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../constants';

interface InstructionInputProps {
    node: Node;
    onDataChange: (id: string, data: Partial<Node>) => void;
    onExecute: (nodeId: string, instruction: string) => void;
}

const RunIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
);

export const InstructionInput: React.FC<InstructionInputProps> = ({ node, onDataChange, onExecute }) => {
    const [instruction, setInstruction] = useState(node.instruction);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isLocked = node.locked;

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
        if (isLocked) return;
        const newInstruction = e.target.value;
        setInstruction(newInstruction);
        onDataChange(node.id, { instruction: newInstruction });
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (isLocked) return;
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

    const nodeHeight = node.height || DEFAULT_NODE_HEIGHT;
    const nodeWidth = node.width || DEFAULT_NODE_WIDTH;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: `${node.position.y + nodeHeight + 12}px`,
        left: `${node.position.x + nodeWidth / 2}px`,
        transform: 'translateX(-50%)',
        width: `${nodeWidth}px`,
        zIndex: 20,
    };

    const currentModel = node.selectedModel || (node.type === 'image' ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview');

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
                        placeholder={isLocked ? '' : 'Enter instructions...'}
                        value={isLocked ? '' : instruction}
                        onChange={handleInstructionChange}
                        onKeyDown={handleKeyDown}
                        readOnly={isLocked}
                        className={`w-full bg-transparent text-slate-200 p-3 text-sm resize-none focus:outline-none placeholder:text-slate-600 max-h-40 custom-scrollbar font-mono leading-relaxed ${isLocked ? 'cursor-not-allowed text-amber-200' : ''}`}
                        rows={1}
                    />
                    {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </div>
                    )}
                    <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                </div>

                <div className="flex justify-between items-center mt-1.5 px-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/5 cursor-help transition-colors hover:bg-white/10">
                        <div className={`w-1.5 h-1.5 rounded-full ${node.type === 'text' ? 'bg-neon-blue' : 'bg-neon-purple'} shadow-[0_0_5px_currentColor]`}></div>
                        {node.type === 'image' ? (
                            <select
                                value={currentModel}
                                onChange={handleModelChange}
                                disabled={isLocked}
                                className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="gemini-3-pro-image-preview" className="bg-slate-800 text-slate-200">Nano Banana Pro</option>
                                <option value="gemini-2.5-flash-image" className="bg-slate-800 text-slate-200">Nano Banana</option>
                            </select>
                        ) : (
                            <select
                                value={currentModel}
                                onChange={handleModelChange}
                                disabled={isLocked}
                                className="text-[10px] font-bold text-slate-400 bg-transparent uppercase tracking-wider focus:outline-none cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="gemini-3-pro-preview" className="bg-slate-800 text-slate-200">Gemini 3.0 Pro</option>
                                <option value="gemini-2.5-flash" className="bg-slate-800 text-slate-200">Gemini 2.5 Flash</option>
                            </select>
                        )}
                    </div>

                    <button
                        onClick={handleExecute}
                        disabled={node.status === 'running'}
                        className={`
                            w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200
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
    );
};
