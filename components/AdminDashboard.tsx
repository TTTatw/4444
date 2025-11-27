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

interface Stats {
    totalUsers: number;
    totalCreditsConsumed: number;
    activeUsers24h: number;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose, currentUser }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'logs'>('overview');
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editBalance, setEditBalance] = useState(0);

    const API_BASE = import.meta.env.VITE_API_URL || 'https://4444-production.up.railway.app'; // Fallback or env

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
            }
        } catch (err) {
            console.error(err);
            alert('Failed to load data');
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
            alert('Update failed');
        }
    };

    const handleBanUser = async (user: User) => {
        if (!confirm(`Are you sure you want to ${user.status === 'banned' ? 'unban' : 'ban'} ${user.email}?`)) return;
        try {
            await fetchWithAuth(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: user.status === 'banned' ? 'active' : 'banned'
                })
            });
            loadData();
        } catch (err) {
            alert('Action failed');
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-6xl h-[85vh] bg-[#0f1118] border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-[#141925]">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold">
                            AD
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Admin Dashboard</h2>
                            <p className="text-xs text-slate-400">System Management & Analytics</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 bg-[#0f1118]">
                    {(['overview', 'users', 'logs'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-4 text-sm font-medium transition-colors relative ${activeTab === tab ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-[#0f1118] custom-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview' && stats && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                                        <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total Users</h3>
                                        <p className="text-4xl font-bold text-white mt-2">{stats.totalUsers}</p>
                                    </div>
                                    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                                        <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Credits Consumed</h3>
                                        <p className="text-4xl font-bold text-emerald-400 mt-2">{stats.totalCreditsConsumed}</p>
                                    </div>
                                    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                                        <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Active Users (24h)</h3>
                                        <p className="text-4xl font-bold text-blue-400 mt-2">{stats.activeUsers24h}</p>
                                    </div>
                                    {/* Placeholder for Chart */}
                                    <div className="col-span-full bg-slate-800/30 p-8 rounded-xl border border-slate-700 flex items-center justify-center h-64 text-slate-500">
                                        [Usage Trend Chart Placeholder - Requires Recharts]
                                    </div>
                                </div>
                            )}

                            {activeTab === 'users' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-800/50 text-xs uppercase font-medium text-slate-400">
                                            <tr>
                                                <th className="px-4 py-3 rounded-l-lg">User</th>
                                                <th className="px-4 py-3">Role</th>
                                                <th className="px-4 py-3">Balance</th>
                                                <th className="px-4 py-3">Total Spent</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3 rounded-r-lg text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {users.map(user => (
                                                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-white">{user.email}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700 text-slate-300'}`}>
                                                            {user.role}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-emerald-400">{user.balance}</td>
                                                    <td className="px-4 py-3 font-mono text-slate-400">{user.total_spent}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs ${user.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                                                            {user.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right space-x-2">
                                                        <button
                                                            onClick={() => { setEditingUser(user); setEditBalance(user.balance); }}
                                                            className="text-blue-400 hover:text-blue-300"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleBanUser(user)}
                                                            className={`${user.status === 'banned' ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`}
                                                        >
                                                            {user.status === 'banned' ? 'Unban' : 'Ban'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'logs' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-800/50 text-xs uppercase font-medium text-slate-400">
                                            <tr>
                                                <th className="px-4 py-3 rounded-l-lg">Time</th>
                                                <th className="px-4 py-3">User</th>
                                                <th className="px-4 py-3">Model</th>
                                                <th className="px-4 py-3">Type</th>
                                                <th className="px-4 py-3">Cost</th>
                                                <th className="px-4 py-3 rounded-r-lg">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {logs.map(log => (
                                                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-white">{log.user_email}</td>
                                                    <td className="px-4 py-3 font-mono text-xs">{log.model}</td>
                                                    <td className="px-4 py-3">{log.resource_type}</td>
                                                    <td className="px-4 py-3 font-mono text-emerald-400">-{log.cost_credits}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs ${log.status === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
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
                        </>
                    )}
                </div>

                {/* Edit Modal */}
                {editingUser && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-[#141925] p-6 rounded-xl border border-slate-700 w-96 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-4">Edit User Balance</h3>
                            <p className="text-sm text-slate-400 mb-4">User: {editingUser.email}</p>
                            <div className="mb-6">
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Balance</label>
                                <input
                                    type="number"
                                    value={editBalance}
                                    onChange={(e) => setEditBalance(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                                <button onClick={handleUpdateUser} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">Save Changes</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
