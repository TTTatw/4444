import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { HistoryItem, SerializedConnection, SerializedNode, WorkflowAsset } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Some browsers/contexts禁用 localStorage 会导致 “Access to storage is not allowed”。
// 提供一个安全的 storage 选择：localStorage -> sessionStorage -> 内存。
const memoryStorage = (() => {
    const data: Record<string, string> = {};
    return {
        getItem: (key: string) => (key in data ? data[key] : null),
        setItem: (key: string, value: string) => { data[key] = value; },
        removeItem: (key: string) => { delete data[key]; },
    } as Storage;
})();

const pickStorage = (): Storage | undefined => {
    if (typeof window === 'undefined') return undefined;
    const tryUse = (s?: Storage) => {
        if (!s) return undefined;
        try {
            const k = '__sb_test__';
            s.setItem(k, '1');
            s.removeItem(k);
            return s;
        } catch {
            return undefined;
        }
    };
    return tryUse(window.localStorage) || tryUse(window.sessionStorage) || memoryStorage;
};

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
    const storage = pickStorage();
    supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            storage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        },
    });
} else {
    console.warn('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable shared storage.');
}

const ASSET_TABLE = 'assets';
const HISTORY_TABLE = 'history_items';
const USER_TABLE = 'users';

type AssetRow = {
    id: string;
    name: string;
    tags: string[] | null;
    notes: string | null;
    nodes: SerializedNode[];
    connections: SerializedConnection[];
    created_at?: string;
    visibility?: 'public' | 'private';
    owner_id?: string;
};

type HistoryRow = {
    id: string;
    image: string;
    prompt: string;
    context: string;
    node_name: string;
    created_at: string;
    owner_id?: string;
};

export const isSupabaseConfigured = () => Boolean(supabase);

export const fetchAssets = async (): Promise<WorkflowAsset[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from(ASSET_TABLE).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: AssetRow) => ({
        id: row.id,
        name: row.name,
        tags: row.tags || [],
        notes: row.notes || '',
        nodes: row.nodes,
        connections: row.connections,
        visibility: row.visibility || 'public',
        ownerId: row.owner_id
    }));
};

export const upsertAsset = async (asset: WorkflowAsset) => {
    if (!supabase) return;
    const { error } = await supabase.from(ASSET_TABLE).upsert({
        id: asset.id,
        name: asset.name,
        tags: asset.tags,
        notes: asset.notes,
        nodes: asset.nodes,
        connections: asset.connections,
        visibility: asset.visibility || 'public',
        owner_id: asset.ownerId
    });
    if (error) throw error;
};

export const deleteAsset = async (assetId: string) => {
    if (!supabase) return;
    const { error } = await supabase.from(ASSET_TABLE).delete().eq('id', assetId);
    if (error) throw error;
};

export const fetchHistoryItems = async (): Promise<HistoryItem[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from(HISTORY_TABLE).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: HistoryRow) => ({
        id: row.id,
        timestamp: new Date(row.created_at),
        image: row.image,
        prompt: row.prompt,
        context: row.context,
        nodeName: row.node_name,
        ownerId: row.owner_id,
    }));
};

export const insertHistoryItem = async (item: HistoryItem, ownerId?: string) => {
    if (!supabase) return;
    const { error } = await supabase.from(HISTORY_TABLE).insert({
        id: item.id,
        image: item.image,
        prompt: item.prompt,
        context: item.context,
        node_name: item.nodeName,
        created_at: item.timestamp.toISOString(),
        owner_id: ownerId ?? item.ownerId,
    });
    if (error) throw error;
};

export const removeHistoryItem = async (id: string, ownerId?: string) => {
    if (!supabase) return;
    const query = supabase.from(HISTORY_TABLE).delete().eq('id', id);
    const { error } = ownerId ? await query.eq('owner_id', ownerId) : await query;
    if (error) throw error;
};

export const clearHistoryItems = async (ownerId?: string) => {
    if (!supabase) return;
    const query = supabase.from(HISTORY_TABLE).delete();
    const { error } = ownerId ? await query.eq('owner_id', ownerId) : await query;
    if (error) throw error;
};

// --- Users (simple auth, stored in Supabase) ---
type UserRow = {
    id: string;
    name: string;
    password: string;
    created_at?: string;
};

export const fetchUsers = async (): Promise<{ name: string; password: string; id: string; email?: string; }[]> => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) return [];

    const response = await fetch('https://4444-production.up.railway.app/api/users', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to list users');
    }

    const data = await response.json();
    return data.users;
};

export const upsertUser = async (user: { id?: string; name: string; password: string; }) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) return;

    const response = await fetch('https://4444-production.up.railway.app/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: user.name, password: user.password, role: 'user' })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create user');
    }
};

export const deleteUser = async (id: string) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) return;

    const response = await fetch(`https://4444-production.up.railway.app/api/users/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete user');
    }
};

export const getSupabaseClient = () => supabase;
export const supabaseAuth = () => supabase?.auth;
