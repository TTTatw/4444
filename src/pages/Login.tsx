
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                alert('注册成功！请检查邮箱完成验证 (如果 Supabase 开启了验证)。');
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                navigate('/');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-cosmic-900 font-sans">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cosmic-800 via-cosmic-900 to-black opacity-80"></div>
            <div className="absolute w-[500px] h-[500px] bg-neon-purple/20 rounded-full blur-[100px] top-[-100px] left-[-100px] animate-pulse-slow"></div>
            <div className="absolute w-[400px] h-[400px] bg-neon-blue/20 rounded-full blur-[100px] bottom-[-50px] right-[-50px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

            <div className="relative z-10 w-full max-w-md p-8 mx-4">
                <div className="glass-panel rounded-2xl p-8 shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-white/10 backdrop-blur-xl">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple mb-2">
                            Gemini Canvas
                        </h1>
                        <p className="text-slate-400">可视化 AI 工作流构建器</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleAuth} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Email</label>
                            <input 
                                type="email" 
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                                placeholder="name@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Password</label>
                            <input 
                                type="password" 
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-white text-black font-bold py-3.5 rounded-lg hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.2)] mt-2"
                        >
                            {loading ? 'Processing...' : (isSignUp ? '注册账户' : '登录')}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button 
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            {isSignUp ? '已有账户? 点击登录' : '没有账户? 点击注册'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
