import React, { useState } from 'react';

interface Props {
    onClose: () => void;
    onSave: (details: { name: string; tags: string[]; notes: string; visibility: 'public' | 'private' }) => void;
    groupName: string;
    defaultVisibility?: 'public' | 'private';
}

export const SaveAssetModal: React.FC<Props> = ({ onClose, onSave, groupName, defaultVisibility = 'public' }) => {
    const [name, setName] = useState(groupName);
    const [tags, setTags] = useState('');
    const [notes, setNotes] = useState('');
    const [visibility, setVisibility] = useState<'public' | 'private'>(defaultVisibility);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            name,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            notes,
            visibility,
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="bg-[#2d2d2d] border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSave}>
                    <div className="p-6">
                        <h2 className="text-xl font-bold text-slate-100 mb-1">创建新资产</h2>
                        <p className="text-sm text-slate-400 mb-6">从画布选中的节点创建的资产模板</p>

                        <div className="flex space-x-8">
                            <div className="w-1/3 flex flex-col items-center justify-center bg-slate-800/50 rounded-xl p-4">
                                <svg className="w-20 h-20 text-slate-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                <p className="text-xs text-slate-500 mt-2 text-center">资产预览即将上线</p>
                            </div>

                            <div className="w-2/3 space-y-4">
                                <div>
                                    <label htmlFor="asset-name" className="block text-sm font-medium text-slate-300 mb-1">名称</label>
                                    <input id="asset-name" type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-700/80 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                                </div>
                                <div>
                                    <label htmlFor="asset-tags" className="block text-sm font-medium text-slate-300 mb-1">标签</label>
                                    <input id="asset-tags" type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="用逗号分隔, e.g. marketing, social-media" className="w-full bg-slate-700/80 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label htmlFor="asset-notes" className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                                    <textarea id="asset-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-slate-700/80 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none custom-scrollbar" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">可见性</label>
                                    <div className="flex items-center space-x-3">
                                        <label className="flex items-center space-x-2 text-sm text-slate-200">
                                            <input type="radio" name="asset-visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
                                            <span>公开（可查看/编辑）</span>
                                        </label>
                                        <label className="flex items-center space-x-2 text-sm text-slate-200">
                                            <input type="radio" name="asset-visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
                                            <span>个人（仅拥有者可编辑，其他人可执行但不可查看提示词）</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end p-4 bg-slate-800/50 border-t border-slate-700 rounded-b-2xl space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-md text-sm font-semibold text-white transition-colors">取消</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-sm font-semibold text-white transition-colors">确认</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
