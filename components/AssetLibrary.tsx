
import React from 'react';
import type { WorkflowAsset, SerializedNode, SerializedConnection } from '../types';

interface Props {
    assets: WorkflowAsset[];
    onClose: () => void;
    onAdd: (asset: { nodes: SerializedNode[], connections: SerializedConnection[] }) => void;
    onDownload: (asset: WorkflowAsset) => void;
    onDelete: (assetId: string) => void;
}

const AddIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const DownloadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>);
const DeleteIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>);

export const AssetLibrary: React.FC<Props> = ({ assets, onClose, onAdd, onDownload, onDelete }) => {
    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog" aria-modal="true" aria-labelledby="asset-library-title"
        >
            <div 
                className="bg-[#2d2d2d] border border-slate-700 w-full max-w-3xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 id="asset-library-title" className="text-xl font-bold text-slate-100">资产库</h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                        aria-label="关闭"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-grow p-2 overflow-y-auto custom-scrollbar">
                    {assets.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            <p>还没有已保存的资产</p>
                        </div>
                    ) : (
                        <ul className="space-y-2 p-2">
                            {assets.map(asset => (
                                <li key={asset.id} className="bg-slate-800/60 rounded-lg p-3 flex items-center justify-between transition-colors hover:bg-slate-700/80">
                                    <div>
                                        <p className="font-semibold text-slate-100">{asset.name}</p>
                                        <p className="text-sm text-slate-400">{asset.notes || '无备注'}</p>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {asset.tags.map(tag => (
                                                <span key={tag} className="text-xs bg-sky-800/50 text-sky-300 px-2 py-0.5 rounded-full">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                        <button onClick={() => { onAdd({ nodes: asset.nodes, connections: asset.connections }); onClose(); }} className="p-2 text-slate-300 hover:bg-slate-600 rounded-md" title="添加到画布"><AddIcon /></button>
                                        <button onClick={() => onDownload(asset)} className="p-2 text-slate-300 hover:bg-slate-600 rounded-md" title="下载"><DownloadIcon /></button>
                                        <button onClick={() => onDelete(asset.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-md" title="删除"><DeleteIcon /></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
