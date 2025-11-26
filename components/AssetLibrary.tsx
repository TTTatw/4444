import React, { useMemo, useState } from 'react';
import type { WorkflowAsset } from '../types';

interface Props {
    assets: WorkflowAsset[];
    onClose: () => void;
    onAdd: (asset: WorkflowAsset) => void;
    onDownload: (asset: WorkflowAsset) => void;
    onDelete: (assetId: string) => void;
}

const AddIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const DownloadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>);
const DeleteIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>);

const getPreview = (asset: WorkflowAsset) => {
    const firstImage = asset.nodes.find(n => n.type === 'image' && n.inputImage);
    if (firstImage) return { type: 'image', value: firstImage.inputImage };
    const firstText = asset.nodes.find(n => n.type === 'text' && (n.content || n.instruction));
    if (firstText) return { type: 'text', value: firstText.content || firstText.instruction || '' };
    return null;
};

export const AssetLibrary: React.FC<Props> = ({ assets, onClose, onAdd, onDownload, onDelete }) => {
    const [tab, setTab] = useState<'workflow' | 'preset'>('workflow');
    const [filterTag, setFilterTag] = useState<string>('all');

    const scopedAssets = useMemo(() => {
        return tab === 'workflow'
            ? assets.filter(a => !(a.tags || []).includes('preset'))
            : assets.filter(a => (a.tags || []).includes('preset'));
    }, [assets, tab]);

    const tags = useMemo(() => {
        const t = new Set<string>();
        scopedAssets.forEach(a => (a.tags || []).forEach(tag => t.add(tag)));
        return ['all', ...Array.from(t)];
    }, [scopedAssets]);

    const filteredAssets = useMemo(() => {
        if (filterTag === 'all') return scopedAssets;
        return scopedAssets.filter(a => (a.tags || []).includes(filterTag));
    }, [scopedAssets, filterTag]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog" aria-modal="true" aria-labelledby="asset-library-title"
        >
            <div
                className="bg-[#12141c] border border-slate-700 w-full max-w-5xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <h2 id="asset-library-title" className="text-xl font-bold text-slate-100">资源库</h2>
                        <div className="flex bg-slate-800/80 rounded-full p-1">
                            <button
                                className={`px-3 py-1 text-sm rounded-full ${tab === 'workflow' ? 'bg-slate-600 text-white' : 'text-slate-300'}`}
                                onClick={() => { setTab('workflow'); setFilterTag('all'); }}
                            >工作流</button>
                            <button
                                className={`px-3 py-1 text-sm rounded-full ${tab === 'preset' ? 'bg-slate-600 text-white' : 'text-slate-300'}`}
                                onClick={() => { setTab('preset'); setFilterTag('all'); }}
                            >预设</button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={filterTag}
                            onChange={e => setFilterTag(e.target.value)}
                            className="bg-slate-800 text-slate-200 text-sm px-2 py-1 rounded border border-slate-700"
                        >
                            {tags.map(tag => (
                                <option key={tag} value={tag}>{tag === 'all' ? '全部' : tag}</option>
                            ))}
                        </select>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                            aria-label="关闭"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-grow p-4 overflow-y-auto custom-scrollbar">
                    {filteredAssets.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            <p>暂无 {tab === 'workflow' ? '工作流' : '预设'} 资源</p>
                        </div>
                    ) : tab === 'preset' ? (
                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {filteredAssets.map(asset => {
                                const preview = getPreview(asset);
                                return (
                                    <div key={asset.id} className="relative bg-slate-800/80 rounded-xl border border-slate-700 overflow-hidden hover:border-sky-500 transition-colors group flex flex-col">
                                        <div className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
                                            {preview ? (
                                                preview.type === 'image' ? (
                                                    <img src={`data:image/png;base64,${preview.value}`} alt={asset.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <p className="text-slate-200 text-xs px-3 py-2 line-clamp-5">{preview.value}</p>
                                                )
                                            ) : (
                                                <p className="text-slate-500 text-xs flex items-center justify-center h-full">无预览</p>
                                            )}
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                                <button
                                                    onClick={() => { onAdd(asset); onClose(); }}
                                                    className="px-3 py-1 rounded-lg bg-sky-500 text-white text-sm"
                                                >
                                                    使用
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            <p className="text-xs font-semibold text-white line-clamp-1">{asset.name}</p>
                                            <div className="flex flex-wrap gap-1">
                                                {(asset.tags || ['无标签']).map(tag => (
                                                    <span key={tag} className="text-[9px] bg-slate-700 text-slate-200 px-2 py-0.5 rounded-full">{tag}</span>
                                                ))}
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => onDownload(asset)} className="p-1 text-slate-300 hover:bg-slate-600 rounded-md" title="下载"><DownloadIcon /></button>
                                                <button onClick={() => onDelete(asset.id)} className="p-1 text-red-400 hover:bg-red-500/20 rounded-md" title="删除"><DeleteIcon /></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {filteredAssets.map(asset => (
                                <li key={asset.id} className="bg-slate-800/60 rounded-lg p-3 flex items-center justify-between transition-colors hover:bg-slate-700/80">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-slate-100">{asset.name}</p>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide ${asset.visibility === 'private' ? 'bg-amber-900/60 text-amber-200 border border-amber-500/40' : 'bg-emerald-900/50 text-emerald-200 border border-emerald-500/40'}`}>
                                                {asset.visibility === 'private' ? '个人' : '公开'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400">{asset.notes || '无备注'}</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {(asset.tags && asset.tags.length > 0 ? asset.tags : ['无标签']).map(tag => (
                                                <span key={tag} className="text-xs bg-sky-800/50 text-sky-300 px-2 py-0.5 rounded-full">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                        <button onClick={() => { onAdd(asset); onClose(); }} className="p-2 text-slate-300 hover:bg-slate-600 rounded-md" title="添加到画布"><AddIcon /></button>
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
