
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    userId: string;
    onKeySaved: (key: string) => void;
    isOpen: boolean;
}

export const ApiKeyModal: React.FC<Props> = ({ userId, onKeySaved, isOpen }) => {
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!key.trim()) return;
        setLoading(true);
        setError(null);

        try {
            // Update profile in Supabase
            const { error: updateError } = await supabase
                .from('profiles')
                .upsert({ id: userId, google_api_key: key.trim() });

            if (updateError) throw updateError;

            onKeySaved(key.trim());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <div className="bg-[#1e1b4b] border border-neon-blue/30 w-full max-w-md rounded-2xl shadow-[0_0_50px_rgba(0,243,255,0.2)] p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue to-neon-purple"></div>
                
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neon-blue"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    配置 API Key
                </h2>
                <p className="text-slate-400 mb-6 text-sm">
                    为了使用 Gemini 模型，您需要绑定 Google AI Studio API Key。该 Key 将安全存储在您的账户配置中。
                </p>

                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Google API Key</label>
                        <input 
                            type="password" 
                            value={key}
                            onChange={e => setKey(e.target.value)}
                            className="w-full bg-black/40 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-neon-blue transition-colors"
                            placeholder="AIzaSy..."
                            autoFocus
                        />
                    </div>

                    {error && <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded border border-red-500/20">{error}</div>}

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={loading || !key}
                            className="w-full bg-gradient-to-r from-neon-blue to-cosmic-600 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-neon-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                        >
                            {loading ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></span> : null}
                            {loading ? '保存中...' : '绑定并开始'}
                        </button>
                    </div>
                    
                    <div className="text-center mt-4">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:text-sky-300 underline">
                            没有 Key? 点击这里获取
                        </a>
                    </div>
                </form>
            </div>
        </div>
    );
};
