import React, { useState, useEffect } from 'react';
import { supabaseAuth } from '../services/storageService';

interface CreditHistoryModalProps {
    onClose: () => void;
    currentUser: { role: string; id: string; name: string };
}

interface Log {
    id: number;
    model: string;
    resource_type: string;
    cost_credits: number;
    status: string;
    created_at: string;
}

interface ModelCost {
    model_name: string;
    cost: number;
    type: string;
}

interface Request {
    id: string;
    amount: number;
    status: string;
    created_at: string;
}

export const CreditHistoryModal: React.FC<CreditHistoryModalProps> = ({ onClose, currentUser }) => {
    const [activeTab, setActiveTab] = useState<'logs' | 'costs' | 'request'>('logs');
    const [logs, setLogs] = useState<Log[]>([]);
    const [costs, setCosts] = useState<ModelCost[]>([]);
    const [requests, setRequests] = useState<Request[]>([]);
    const [requestAmount, setRequestAmount] = useState<number>(1000);
    const [isLoading, setIsLoading] = useState(false);

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

    const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
        const session = await supabaseAuth()?.getSession();
        const token = session?.data.session?.access_token;
        if (!token) throw new Error('No token');

        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'logs') {
                const data = await fetchWithAuth('/api/user/logs');
                setLogs(data.data);
            } else if (activeTab === 'costs') {
                const data = await fetchWithAuth('/api/config/models');
                setCosts(data.costs);
            } else if (activeTab === 'request') {
                const data = await fetchWithAuth('/api/user/requests');
                setRequests(data.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const handleRequest = async () => {
        try {
            await fetchWithAuth('/api/user/request-credits', {
                method: 'POST',
                body: JSON.stringify({ amount: requestAmount })
            });
            alert('申请已提交！');
            loadData();
        } catch (err) {
            alert('申请失败');
        }
    };

    const tabs = currentUser.role === 'admin' ? ['logs', 'costs'] : ['logs', 'costs', 'request'];

    const getTabLabel = (tab: string) => {
        switch (tab) {
            case 'logs': return '记录';
            case 'costs': return '费率';
            case 'request': return '申请';
            default: return tab;
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl h-[70vh] bg-[#1e1e1e] rounded-lg border border-[#333] shadow-xl flex flex-col overflow-hidden relative">
                {/* Header */}
                <div className="p-6 border-b border-[#333] flex justify-between items-center bg-[#252526]">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-yellow-500 flex items-center justify-center text-black font-bold">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">积分中心</h2>
                            <p className="text-xs text-[#888] font-medium">查看记录与管理积分</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[#333] rounded text-[#888] hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#333] bg-[#1e1e1e]">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-8 py-4 text-sm font-medium transition-all relative ${activeTab === tab ? 'text-yellow-500 bg-[#252526]' : 'text-[#888] hover:text-[#ccc] hover:bg-[#252526]'}`}
                        >
                            {getTabLabel(tab)}
                            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-500"></div>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-[#1e1e1e] custom-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'logs' && (
                                <div className="overflow-hidden rounded border border-[#333] bg-[#252526]">
                                    <table className="w-full text-left text-sm text-[#ccc]">
                                        <thead className="bg-[#333] text-xs uppercase font-bold text-[#888] tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">时间</th>
                                                <th className="px-6 py-4">模型</th>
                                                <th className="px-6 py-4">消耗</th>
                                                <th className="px-6 py-4">状态</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#333]">
                                            {logs.map(log => (
                                                <tr key={log.id} className="hover:bg-[#333] transition-colors">
                                                    <td className="px-6 py-4 text-[#888] font-mono text-xs">{new Date(log.created_at).toLocaleString()}</td>
                                                    <td className="px-6 py-4 font-mono text-xs text-white">{log.model}</td>
                                                    <td className="px-6 py-4 font-mono text-red-400">-{log.cost_credits}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${log.status === 'success' ? 'bg-[#1e3a2a] text-[#4ade80]' : 'bg-[#3a1e1e] text-[#f87171]'}`}>
                                                            {log.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {logs.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-8 text-center text-[#888]">暂无记录</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'costs' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {costs.map(cost => (
                                        <div key={cost.model_name} className="bg-[#252526] p-4 rounded border border-[#333] flex justify-between items-center group hover:border-[#555] transition-all">
                                            <div>
                                                <h4 className="text-white font-medium text-sm">{cost.model_name}</h4>
                                                <span className="text-xs text-[#888] uppercase tracking-wider">{cost.type}</span>
                                            </div>
                                            <div className="text-xl font-bold text-yellow-500 font-mono">
                                                {cost.cost} <span className="text-xs text-[#888] font-normal">积分/次</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'request' && (
                                <div className="space-y-8">
                                    <div className="bg-[#252526] p-6 rounded border border-[#333]">
                                        <h3 className="text-white font-bold mb-4">申请更多积分</h3>
                                        <div className="flex gap-4">
                                            <input
                                                type="number"
                                                value={requestAmount}
                                                onChange={(e) => setRequestAmount(Number(e.target.value))}
                                                className="flex-1 bg-[#1e1e1e] border border-[#333] rounded px-4 py-3 text-white font-mono focus:outline-none focus:border-yellow-500 transition-all"
                                                placeholder="数量"
                                                min={1}
                                            />
                                            <button
                                                onClick={handleRequest}
                                                className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded transition-all"
                                            >
                                                提交申请
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-[#888] text-xs font-bold uppercase tracking-wider mb-4">申请历史</h3>
                                        <div className="overflow-hidden rounded border border-[#333] bg-[#252526]">
                                            <table className="w-full text-left text-sm text-[#ccc]">
                                                <thead className="bg-[#333] text-xs uppercase font-bold text-[#888] tracking-wider">
                                                    <tr>
                                                        <th className="px-6 py-4">日期</th>
                                                        <th className="px-6 py-4">数量</th>
                                                        <th className="px-6 py-4">状态</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#333]">
                                                    {requests.map(req => (
                                                        <tr key={req.id} className="hover:bg-[#333] transition-colors">
                                                            <td className="px-6 py-4 text-[#888] font-mono text-xs">{new Date(req.created_at).toLocaleDateString()}</td>
                                                            <td className="px-6 py-4 font-mono text-white">+{req.amount}</td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${req.status === 'approved' ? 'bg-[#1e3a2a] text-[#4ade80]' :
                                                                    req.status === 'rejected' ? 'bg-[#3a1e1e] text-[#f87171]' :
                                                                        'bg-[#3a2e1e] text-[#facc15]'
                                                                    }`}>
                                                                    {req.status === 'approved' ? '已通过' : req.status === 'rejected' ? '已拒绝' : '审核中'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {requests.length === 0 && (
                                                        <tr>
                                                            <td colSpan={3} className="px-6 py-8 text-center text-[#888]">暂无申请</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
