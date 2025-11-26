import React, { useState } from 'react';
import type { Group } from '../types';

interface GroupProps {
    group: Group;
    onRunWorkflow: (groupId: string) => void;
    onMouseDown: (groupId: string, e: React.MouseEvent) => void;
    onSaveAsset: (groupId: string) => void;
    onUpdateName: (groupId: string, newName: string) => void;
}

const SaveIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>);
const RunIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 5.14v14l11-7-11-7z"/></svg>);

export const GroupComponent: React.FC<GroupProps> = ({ group, onRunWorkflow, onMouseDown, onSaveAsset, onUpdateName }) => {
    const [isNameEditing, setIsNameEditing] = useState(false);
    
    const groupStyle: React.CSSProperties = {
        position: 'absolute',
        left: group.position.x,
        top: group.position.y,
        width: group.size.width,
        height: group.size.height,
        paddingTop: 40,
        pointerEvents: 'auto',
    };

    const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        onUpdateName(group.id, e.target.value || "Untitled Workflow");
        setIsNameEditing(false);
    };

    return (
        <div 
            id={`group-${group.id}`}
            style={groupStyle} 
            className={`group border-2 border-dashed rounded-xl transition-colors duration-200 cursor-grab ${group.selected ? 'border-cyan-400' : 'border-sky-500/50'}`}
            onMouseDown={(e) => {
                if (e.button === 2) {
                    // allow canvas to handle right-drag pan; prevent menu only
                    e.preventDefault();
                    return;
                }
                onMouseDown(group.id, e);
            }}
            onContextMenu={(e) => {
                e.preventDefault();
            }}
        >
            <div className={`absolute top-2 left-4 right-4 flex items-center justify-between gap-3 pointer-events-none transition-opacity duration-150 ${group.selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <div className="pointer-events-auto">
                    {isNameEditing ? (
                        <input 
                            type="text"
                            defaultValue={group.name}
                            onBlur={handleNameBlur}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            className="bg-slate-700 text-sm font-semibold px-2 py-1 rounded w-auto focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                        />
                    ) : (
                        <h3 
                            className="font-semibold text-sm capitalize text-slate-300 select-none px-2 py-1 rounded hover:bg-slate-700/50"
                            onDoubleClick={(e) => { e.stopPropagation(); setIsNameEditing(true); }}
                            title="双击编辑名称"
                        >
                            {group.name}
                        </h3>
                    )}
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSaveAsset(group.id); }}
                        className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1.5 text-xs font-bold shadow-lg transition-colors"
                        title="另存为资产"
                    >
                        <SaveIcon />
                        <span>保存</span>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRunWorkflow(group.id); }}
                        className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-500 rounded-md px-3 py-1.5 text-xs font-bold shadow-lg transition-colors"
                        title="运行工作流"
                    >
                        <RunIcon />
                        <span>运行</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
