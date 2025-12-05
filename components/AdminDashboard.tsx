import React, { useState, useEffect } from 'react';
import { supabaseAuth } from '../services/storageService';

interface AdminDashboardProps {
    onClose: () => void;
    currentUser: { role: string; id: string; name: string };
}

interface User {
    id: string;
    email: string;
    role: string;
    created_at: string;
    balance: number;
    status: string;
    total_spent: number;
}

interface Log {
    id: number;
    user_email: string;
    model: string;
    resource_type: string;
    cost_credits: number;
    status: string;
    created_at: string;
    error_message?: string;
}

interface ModelCost {
    model_name: string;
    cost: number;
    type: string;
}

interface Request {
    id: string;
    user_id: string;
    user_email: string;
    amount: number;
    status: string;
    created_at: string;
}

interface Stats {
    totalUsers: number;
    totalCreditsConsumed: number;
    activeUsers24h: number;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose, currentUser }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'logs' | 'requests' | 'settings'>('overview');
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [requests, setRequests] = useState<Request[]>([]);
    const [costs, setCosts] = useState<ModelCost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editBalance, setEditBalance] = useState(0);
    const [editingCost, setEditingCost] = useState<ModelCost | null>(null);
    const [editCostValue, setEditCostValue] = useState(0);

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
            if (activeTab === 'overview') {
                const data = await fetchWithAuth('/api/admin/stats');
                setStats(data);
            } else if (activeTab === 'users') {
                const data = await fetchWithAuth('/api/users');
                setUsers(data.users);
            } else if (activeTab === 'logs') {
                const data = await fetchWithAuth('/api/admin/logs');
                setLogs(data.data);
            } else if (activeTab === 'requests') {
                const data = await fetchWithAuth('/api/admin/requests');
                setRequests(data.data);
            } else if (activeTab === 'settings') {
                const data = await fetchWithAuth('/api/config/models');
                setCosts(data.costs);
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

    const handleUpdateUser = async () => {
        if (!editingUser) return;
        try {
            await fetchWithAuth(`/api/admin/users/${editingUser.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    balance: editBalance,
                    status: editingUser.status
                })
            });
            setEditingUser(null);
            loadData(); // Refresh
        } catch (err) {
            alert('更新失败');
        }
    };

    const handleBanUser = async (user: User) => {
        if (!confirm(`确定要${user.status === 'banned' ? '解封' : '封禁'} ${user.email} 吗？`)) return;
        try {
            await fetchWithAuth(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: user.status === 'banned' ? 'active' : 'banned'
                })
            });
            loadData();
        } catch (err) {
            alert('操作失败');
        }
    };

    const handleResolveRequest = async (id: string, status: 'approved' | 'rejected') => {
        if (!confirm(`确定要${status === 'approved' ? '通过' : '拒绝'}此申请吗？`)) return;
        try {
            await fetchWithAuth(`/api/admin/requests/${id}/resolve`, {
                method: 'POST',
                body: JSON.stringify({ status })
            });
            loadData();
        } catch (err) {
            alert('操作失败');
        }
    };

    const handleUpdateCost = async () => {
        if (!editingCost) return;
        try {
            await fetchWithAuth('/api/admin/config/models', {
                method: 'POST',
                body: JSON.stringify({
                    model_name: editingCost.model_name,
                    cost: editCostValue
                })
            });
            setEditingCost(null);
            loadData();
        } catch (err) {
            alert('更新失败');
        }
    };

    const getTabLabel = (tab: string) => {
        switch (tab) {
            case 'overview': return '概览';
            case 'users': return '用户';
            case 'logs': return '日志';
            case 'requests': return '申请';
            case 'settings': return '设置';
            default: return tab;
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-6xl h-[85vh] bg-[#1e1e1e] rounded-lg border border-[#333] shadow-xl flex flex-col overflow-hidden relative">
                {/* Header */}
                <div className="p-6 border-b border-[#333] flex justify-between items-center bg-[#252526]">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-blue-500 flex items-center justify-center text-white font-bold">
                            AD
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">管理后台</h2>
                            <p className="text-xs text-[#888] font-medium">系统管理与数据分析</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[#333] rounded text-[#888] hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#333] bg-[#1e1e1e]">
                    {(['overview', 'users', 'logs', 'requests', 'settings'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-8 py-4 text-sm font-medium transition-all relative ${activeTab === tab ? 'text-blue-500 bg-[#252526]' : 'text-[#888] hover:text-[#ccc] hover:bg-[#252526]'}`}
                        >
                            {getTabLabel(tab)}
                            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500"></div>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-8 bg-[#1e1e1e] custom-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview' && stats && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-[#252526] p-6 rounded border border-[#333] hover:border-[#555] transition-all group">
                                        <h3 className="text-[#888] text-xs font-bold uppercase tracking-wider mb-2">总用户数</h3>
                                        <p className="text-4xl font-bold text-white group-hover:text-blue-500 transition-colors">{stats.totalUsers}</p>
                                    </div>
                                    <div className="bg-[#252526] p-6 rounded border border-[#333] hover:border-[#555] transition-all group">
                                        <h3 className="text-[#888] text-xs font-bold uppercase tracking-wider mb-2">积分消耗</h3>
                                        <p className="text-4xl font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">{stats.totalCreditsConsumed}</p>
                                    </div>
                                    <div className="bg-[#252526] p-6 rounded border border-[#333] hover:border-[#555] transition-all group">
                                        <h3 className="text-[#888] text-xs font-bold uppercase tracking-wider mb-2">活跃用户 (24h)</h3>
                                        <p className="text-4xl font-bold text-blue-400 group-hover:text-blue-300 transition-colors">{stats.activeUsers24h}</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'users' && (
                                <div className="overflow-hidden rounded border border-[#333] bg-[#252526]">
                                    <table className="w-full text-left text-sm text-[#ccc]">
                                        <thead className="bg-[#333] text-xs uppercase font-bold text-[#888] tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">用户</th>
                                                <th className="px-6 py-4">角色</th>
                                                <th className="px-6 py-4">余额</th>
                                                <th className="px-6 py-4">总消耗</th>
                                                <th className="px-6 py-4">状态</th>
                                                <th className="px-6 py-4 text-right">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#333]">
                                            {users.map(user => (
                                                <tr key={user.id} className="hover:bg-[#333] transition-colors">
                                                    <td className="px-6 py-4 font-medium text-white">{user.email}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${user.role === 'admin' ? 'bg-[#3a1e3a] text-[#d8b4fe] border border-[#581c87]' : 'bg-[#1e293b] text-[#94a3b8] border border-[#334155]'}`}>
                                                            {user.role}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-emerald-400 font-bold">{user.balance}</td>
                                                    <td className="px-6 py-4 font-mono text-[#888]">{user.total_spent}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${user.status === 'active' ? 'bg-[#1e3a2a] text-[#4ade80] border border-[#14532d]' : 'bg-[#3a1e1e] text-[#f87171] border border-[#7f1d1d]'}`}>
                                                            {user.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right space-x-3">
                                                        <button
                                                            onClick={() => { setEditingUser(user); setEditBalance(user.balance); }}
                                                            className="text-blue-500 hover:text-white text-xs font-bold uppercase tracking-wide transition-colors"
                                                        >
                                                            编辑
                                                        </button>
                                                        <button
                                                            onClick={() => handleBanUser(user)}
                                                            className={`text-xs font-bold uppercase tracking-wide transition-colors ${user.status === 'banned' ? 'text-emerald-400 hover:text-emerald-300' : 'text-red-400 hover:text-red-300'}`}
                                                        >
                                                            {user.status === 'banned' ? '解封' : '封禁'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'logs' && (
                                <div className="overflow-hidden rounded border border-[#333] bg-[#252526]">
                                    <table className="w-full text-left text-sm text-[#ccc]">
                                        <thead className="bg-[#333] text-xs uppercase font-bold text-[#888] tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">时间</th>
                                                <th className="px-6 py-4">用户</th>
                                                <th className="px-6 py-4">模型</th>
                                                <th className="px-6 py-4">类型</th>
                                                <th className="px-6 py-4">消耗</th>
                                                <th className="px-6 py-4">状态</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#333]">
                                            {logs.map(log => (
                                                <tr key={log.id} className="hover:bg-[#333] transition-colors">
                                                    <td className="px-6 py-4 text-[#888] font-mono text-xs">{new Date(log.created_at).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-white">{log.user_email}</td>
                                                    <td className="px-6 py-4 font-mono text-xs text-[#888]">{log.model}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${log.resource_type === 'image' ? 'bg-[#3a1e2e] text-[#f9a8d4]' : 'bg-[#1e2a3a] text-[#93c5fd]'}`}>
                                                            {log.resource_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-emerald-400">-{log.cost_credits}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${log.status === 'success' ? 'bg-[#1e3a2a] text-[#4ade80]' : 'bg-[#3a1e1e] text-[#f87171]'}`}>
                                                            {log.status}
                                                        </span>
                                                        {log.error_message && <span className="ml-2 text-xs text-red-400" title={log.error_message}>Error</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'requests' && (
                                <div className="overflow-hidden rounded border border-[#333] bg-[#252526]">
                                    <table className="w-full text-left text-sm text-[#ccc]">
                                        <thead className="bg-[#333] text-xs uppercase font-bold text-[#888] tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">时间</th>
                                                <th className="px-6 py-4">用户</th>
                                                <th className="px-6 py-4">数量</th>
                                                <th className="px-6 py-4">状态</th>
                                                <th className="px-6 py-4 text-right">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#333]">
                                            {requests.map(req => (
                                                <tr key={req.id} className="hover:bg-[#333] transition-colors">
                                                    <td className="px-6 py-4 text-[#888] font-mono text-xs">{new Date(req.created_at).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-white">{req.user_email}</td>
                                                    <td className="px-6 py-4 font-mono text-emerald-400">+{req.amount}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${req.status === 'approved' ? 'bg-[#1e3a2a] text-[#4ade80]' :
                                                            req.status === 'rejected' ? 'bg-[#3a1e1e] text-[#f87171]' :
                                                                'bg-[#3a2e1e] text-[#facc15]'
                                                            }`}>
                                                            {req.status === 'approved' ? '已通过' : req.status === 'rejected' ? '已拒绝' : '审核中'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right space-x-2">
                                                        {req.status === 'pending' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleResolveRequest(req.id, 'approved')}
                                                                    className="px-3 py-1 bg-[#1e3a2a] hover:bg-[#14532d] text-[#4ade80] text-xs font-bold rounded transition-colors"
                                                                >
                                                                    通过
                                                                </button>
                                                                <button
                                                                    onClick={() => handleResolveRequest(req.id, 'rejected')}
                                                                    className="px-3 py-1 bg-[#3a1e1e] hover:bg-[#7f1d1d] text-[#f87171] text-xs font-bold rounded transition-colors"
                                                                >
                                                                    拒绝
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {requests.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-8 text-center text-[#888]">暂无申请</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'settings' && (
                                <div className="space-y-8">
                                    {/* System Settings */}
                                    <div>
                                        <h3 className="text-white font-bold mb-4 text-lg flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            系统设置
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {costs.filter(c => c.type === 'system').map(cost => (
                                                <div key={cost.model_name} className="bg-[#252526] p-6 rounded border border-[#333] flex justify-between items-center group hover:border-[#555] transition-all">
                                                    <div>
                                                        <h4 className="text-white font-medium text-sm mb-1">
                                                            {cost.model_name === 'default_new_user_credits' ? '新用户默认积分' : cost.model_name}
                                                        </h4>
                                                        <span className="text-xs text-[#888] uppercase tracking-wider bg-[#1e1e1e] px-2 py-1 rounded">{cost.type}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-xl font-bold text-blue-500 font-mono">
                                                            {cost.cost} <span className="text-xs text-[#888] font-normal">积分</span>
                                                        </div>
                                                        <button
                                                            onClick={() => { setEditingCost(cost); setEditCostValue(cost.cost); }}
                                                            className="p-2 hover:bg-[#333] rounded text-[#888] hover:text-white transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {costs.filter(c => c.type === 'system').length === 0 && (
                                                <div className="col-span-2 text-center py-8 text-[#888] text-sm italic">
                                                    暂无系统设置项 (请重启后端服务以初始化)
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Model Costs */}
                                    <div>
                                        <h3 className="text-white font-bold mb-4 text-lg flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /><path d="M8.5 8.5v.01" /><path d="M16 15.5v.01" /><path d="M12 12v.01" /><path d="M8.5 15.5v.01" /><path d="M15.5 8.5v.01" /></svg>
                                            模型费率
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {costs.filter(c => c.type !== 'system').map(cost => (
                                                <div key={cost.model_name} className="bg-[#252526] p-6 rounded border border-[#333] flex justify-between items-center group hover:border-[#555] transition-all">
                                                    <div>
                                                        <h4 className="text-white font-medium text-sm mb-1">{cost.model_name}</h4>
                                                        <span className="text-xs text-[#888] uppercase tracking-wider bg-[#1e1e1e] px-2 py-1 rounded">{cost.type}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-xl font-bold text-yellow-500 font-mono">
                                                            {cost.cost} <span className="text-xs text-[#888] font-normal">积分</span>
                                                        </div>
                                                        <button
                                                            onClick={() => { setEditingCost(cost); setEditCostValue(cost.cost); }}
                                                            className="p-2 hover:bg-[#333] rounded text-[#888] hover:text-white transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Edit User Modal */}
                {editingUser && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
                        <div className="bg-[#1e1e1e] p-8 rounded border border-[#333] w-96 shadow-2xl transform scale-100">
                            <h3 className="text-xl font-bold text-white mb-6">编辑用户余额</h3>
                            <p className="text-sm text-[#888] mb-6 font-mono bg-[#252526] p-2 rounded border border-[#333]">{editingUser.email}</p>
                            <div className="mb-8">
                                <label className="block text-xs font-bold text-[#888] uppercase mb-2 tracking-wider">余额积分</label>
                                <input
                                    type="number"
                                    value={editBalance}
                                    onChange={(e) => setEditBalance(Number(e.target.value))}
                                    className="w-full bg-[#252526] border border-[#333] rounded px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-blue-500 transition-all"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 text-[#888] hover:text-white text-sm font-medium transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleUpdateUser}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold shadow-lg transition-all"
                                >
                                    保存更改
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Cost Modal */}
                {editingCost && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
                        <div className="bg-[#1e1e1e] p-8 rounded border border-[#333] w-96 shadow-2xl transform scale-100">
                            <h3 className="text-xl font-bold text-white mb-6">编辑模型费率</h3>
                            <p className="text-sm text-[#888] mb-6 font-mono bg-[#252526] p-2 rounded border border-[#333]">{editingCost.model_name}</p>
                            <div className="mb-8">
                                <label className="block text-xs font-bold text-[#888] uppercase mb-2 tracking-wider">单次消耗</label>
                                <input
                                    type="number"
                                    value={editCostValue}
                                    onChange={(e) => setEditCostValue(Number(e.target.value))}
                                    className="w-full bg-[#252526] border border-[#333] rounded px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-yellow-500 transition-all"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingCost(null)}
                                    className="px-4 py-2 text-[#888] hover:text-white text-sm font-medium transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleUpdateCost}
                                    className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded text-sm font-bold shadow-lg transition-all"
                                >
                                    更新费率
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
