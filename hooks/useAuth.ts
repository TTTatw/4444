import { useState, useEffect, useCallback } from 'react';
import { User, Role } from '../types';
import {
    isSupabaseConfigured,
    fetchUsers,
    upsertUser,
    deleteUser,
    supabaseAuth
} from '../services/storageService';

export const useAuth = () => {
    // State
    const [currentUser, setCurrentUser] = useState<User>({ role: 'guest', name: 'Guest', id: 'guest' });
    const [authorizedUsers, setAuthorizedUsers] = useState<User[]>([]);
    const [loginName, setLoginName] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(true);
    const [supabaseEnabled, setSupabaseEnabled] = useState(false);

    // UI State
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('user-api-key'));
    const [apiKeyDraft, setApiKeyDraft] = useState('');

    // Admin User Management State
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newAuthorizedName, setNewAuthorizedName] = useState('');
    const [newAuthorizedPassword, setNewAuthorizedPassword] = useState('');

    // Helper to derive role
    const deriveRole = useCallback((email: string, metadataRole?: string): Role => {
        // 1. Check metadata
        if (metadataRole === 'admin') return 'admin';

        // 2. Check env vars
        const adminList = (((import.meta as any).env?.VITE_ADMIN_EMAILS) || '')
            .split(',')
            .map((s: string) => s.trim().toLowerCase())
            .filter(Boolean);
        const em = (email || '').trim().toLowerCase();
        if (adminList.includes(em)) return 'admin';

        // 3. Check local authorized list (optional, mostly for local mode or overrides)
        const localAuth = localStorage.getItem('authorized-users');
        if (localAuth) {
            try {
                const users = JSON.parse(localAuth);
                if (users.some((u: any) => u.name === email)) return 'user';
            } catch (e) { console.error(e); }
        }

        // Default to 'user' if logged in (since this is only called when session exists)
        return 'user';
    }, []);

    // Initial Load
    useEffect(() => {
        const initAuth = async () => {
            const configured = isSupabaseConfigured();
            setSupabaseEnabled(configured);

            // Load local authorized users
            const localAuth = localStorage.getItem('authorized-users');
            if (localAuth) {
                try {
                    setAuthorizedUsers(JSON.parse(localAuth));
                } catch (e) {
                    console.error("Failed to parse authorized users", e);
                }
            }

            if (!configured) {
                setAuthLoading(false);
                return;
            }

            const auth = supabaseAuth();
            if (auth) {
                const { data } = await auth.getSession();
                if (data.session?.user) {
                    const role = deriveRole(data.session.user.email || '', (data.session.user.user_metadata as any)?.role);
                    setCurrentUser({ role, name: data.session.user.email || 'User', id: data.session.user.id });

                    // If admin, fetch users
                    if (role === 'admin') {
                        try {
                            const users = await fetchUsers();
                            setAuthorizedUsers(users.map(u => ({ id: u.id, name: u.name, password: u.password, role: 'user' })));
                        } catch (e) { console.error(e); }
                    }
                }
            }
            setAuthLoading(false);
        };
        initAuth();
    }, [deriveRole]);

    // Actions
    const handleLogin = async (register = false, email = loginName, password = loginPassword): Promise<void> => {
        const auth = supabaseAuth();
        if (!auth) {
            // Offline/Local mode fallback
            console.warn("Supabase not configured, using local offline mode.");
            setCurrentUser({ role: 'admin', name: email || 'Local User', id: 'local-user' });
            setIsAuthModalOpen(false);
            return;
        }
        try {
            if (register) {
                const { error } = await auth.signUp({ email, password });
                if (error) throw error;
                alert('注册成功，请登录');
                return;
            }
            const { data, error } = await auth.signInWithPassword({ email, password });
            if (error || !data.session) throw error || new Error('No session');
            const role = deriveRole(data.session.user.email || '', (data.session.user.user_metadata as any)?.role);
            setCurrentUser({ role, name: data.session.user.email || 'User', id: data.session.user.id });
            setIsAuthModalOpen(false);
        } catch (error) {
            alert("登录失败，请检查邮箱/密码");
            throw error;
        }
    };

    const handleLogout = async () => {
        if (supabaseEnabled) {
            await supabaseAuth()?.signOut();
        }
        setCurrentUser({ role: 'guest', name: 'Guest', id: 'guest' });
        setLoginName('');
        setLoginPassword('');
        // Note: Clearing app state (nodes, etc.) should be handled by the consumer of this hook if needed
    };

    const handleCreateUser = async () => {
        if (!newUserEmail || !newUserPassword) {
            alert('请输入授权邮箱和密码');
            return;
        }
        try {
            await upsertUser({ name: newUserEmail.trim(), password: newUserPassword });
            setNewUserEmail('');
            setNewUserPassword('');
            // refresh list
            const remoteUsers = await fetchUsers();
            setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.name, password: u.password, role: 'user' })));
            return true;
        } catch (err) {
            alert('创建授权账号失败：' + (err as Error).message);
            return false;
        }
    };

    const handleAddAuthorizedUser = async () => {
        if (!supabaseEnabled) return;
        if (!newAuthorizedName || !newAuthorizedPassword) return;
        try {
            const auth = supabaseAuth();
            if (auth) {
                const { error } = await auth.signUp({ email: newAuthorizedName, password: newAuthorizedPassword });
                if (error) throw error;
            }
            await upsertUser({ name: newAuthorizedName, password: '' });
            const remoteUsers = await fetchUsers();
            setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.email || u.name, password: u.password, role: 'user' })));
            setNewAuthorizedName('');
            setNewAuthorizedPassword('');
            return true;
        } catch (error) {
            alert('添加授权账号失败，请检查邮箱是否已存在');
            return false;
        }
    };

    const handleRemoveAuthorizedUser = async (name: string) => {
        if (!supabaseEnabled) return;
        try {
            const target = authorizedUsers.find(u => u.name === name);
            if (target?.id) await deleteUser(target.id);
            const remoteUsers = await fetchUsers();
            setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.email || u.name, password: u.password, role: 'user' })));
        } catch (error) {
            console.error("Failed to delete user:", error);
        }
    };

    const persistAuthorizedUsers = (users: User[]) => {
        setAuthorizedUsers(users);
        try {
            localStorage.setItem('authorized-users', JSON.stringify(users));
        } catch (error) {
            console.error("Failed to save authorized users:", error);
        }
    };

    const handleSaveApiKey = () => {
        setApiKey(apiKeyDraft.trim() || null);
        try {
            if (apiKeyDraft.trim()) {
                localStorage.setItem('user-api-key', apiKeyDraft.trim());
            } else {
                localStorage.removeItem('user-api-key');
            }
            setIsApiKeyModalOpen(false);
        } catch (e) {
            console.error('Failed to save API key:', e);
        }
    };

    const handleClearApiKey = () => {
        setApiKey(null);
        setApiKeyDraft('');
        localStorage.removeItem('user-api-key');
    };

    return {
        currentUser, setCurrentUser,
        authorizedUsers, setAuthorizedUsers,
        loginName, setLoginName,
        loginPassword, setLoginPassword,
        authLoading,
        supabaseEnabled,
        isAuthModalOpen, setIsAuthModalOpen,
        isApiKeyModalOpen, setIsApiKeyModalOpen,
        apiKey, setApiKey,
        apiKeyDraft, setApiKeyDraft,
        newUserEmail, setNewUserEmail,
        newUserPassword, setNewUserPassword,
        newAuthorizedName, setNewAuthorizedName,
        newAuthorizedPassword, setNewAuthorizedPassword,
        handleLogin,
        handleLogout,
        handleCreateUser,
        handleAddAuthorizedUser,
        handleRemoveAuthorizedUser,
        persistAuthorizedUsers,
        handleSaveApiKey,
        handleClearApiKey
    };
};
