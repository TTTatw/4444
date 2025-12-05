import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { HistoryItem, SerializedConnection, SerializedNode, WorkflowAsset } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';

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

    console.log('[deleteAsset] Starting deletion for asset:', assetId);

    // 1. Fetch asset to find associated images
    const { data: asset, error: fetchError } = await supabase
        .from(ASSET_TABLE)
        .select('nodes, owner_id')
        .eq('id', assetId)
        .single();

    if (fetchError) {
        console.error('[deleteAsset] Error fetching asset:', fetchError);
    } else if (asset && asset.nodes) {
        // 2. Extract image paths
        const imagePaths: string[] = [];
        const nodes = asset.nodes as any[];

        console.log('[deleteAsset] Scanning nodes for images...');
        nodes.forEach(node => {
            if (node.inputImage && typeof node.inputImage === 'string') {
                // Check for images in the 'preset' bucket
                // URL format: .../storage/v1/object/public/preset/userId/filename.png
                if (node.inputImage.includes('/storage/v1/object/public/preset/')) {
                    const parts = node.inputImage.split('/preset/');
                    if (parts.length > 1) {
                        imagePaths.push(parts[1]);
                        console.log('[deleteAsset] Found preset image:', parts[1]);
                    }
                }
            }
        });

        // 3. Delete images from 'preset' bucket
        if (imagePaths.length > 0) {
            console.log('[deleteAsset] Deleting images from bucket:', imagePaths);
            const { error: storageError } = await supabase.storage
                .from('preset')
                .remove(imagePaths);

            if (storageError) {
                console.error('[deleteAsset] Failed to delete preset images:', storageError);
            } else {
                console.log('[deleteAsset] Successfully deleted preset images.');
            }
        } else {
            console.log('[deleteAsset] No preset images found to delete.');
        }
    }

    // 4. Delete Asset Record
    const { error } = await supabase.from(ASSET_TABLE).delete().eq('id', assetId);
    if (error) {
        console.error('[deleteAsset] Error deleting asset record:', error);
        throw error;
    }
    console.log('[deleteAsset] Asset record deleted successfully.');
};

export const fetchHistoryItems = async (page: number = 1, pageSize: number = 20): Promise<HistoryItem[]> => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;

    if (apiBase && token) {
        const res = await fetch(`${apiBase}/api/history?page=${page}&limit=${pageSize}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        const data: HistoryRow[] = json.data || json.items || [];
        // Return array directly to match App.tsx expectation
        return data.map((row: HistoryRow) => ({
            id: row.id,
            timestamp: new Date(row.created_at),
            image: row.image,
            prompt: row.prompt,
            context: row.context,
            nodeName: row.node_name,
            ownerId: row.owner_id,
        }));
    }
    if (!supabase) return [];



    const { data, error } = await supabase
        .from(HISTORY_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

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
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (apiBase && token) {
        await fetch(`${apiBase}/api/history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                id: item.id,
                image: item.image,
                prompt: item.prompt,
                context: item.context,
                node_name: item.nodeName,
                created_at: item.timestamp.toISOString(),
                owner_id: ownerId ?? item.ownerId,
            })
        });
        return;
    }
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
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (apiBase && token) {
        await fetch(`${apiBase}/api/history/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        return;
    }
    if (!supabase) return;

    // 1. Fetch item to get image path
    const { data: item, error: fetchError } = await supabase
        .from(HISTORY_TABLE)
        .select('image')
        .eq('id', id)
        .single();

    if (fetchError) {
        console.error('Error fetching history item for deletion:', fetchError);
    } else if (item && item.image && item.image.startsWith('http')) {
        // 2. Try to delete from storage if it's a Supabase Storage URL
        try {
            const url = new URL(item.image);
            if (url.pathname.includes('/storage/v1/object/public/')) {
                // Path format: /storage/v1/object/public/BUCKET/PATH
                const pathParts = url.pathname.split('/storage/v1/object/public/');
                if (pathParts.length > 1) {
                    const fullPath = pathParts[1]; // e.g. "preset/user/file.png" or "images/file.png"
                    const firstSlash = fullPath.indexOf('/');
                    if (firstSlash > 0) {
                        const bucket = fullPath.substring(0, firstSlash);
                        const filePath = fullPath.substring(firstSlash + 1);

                        console.log(`[removeHistoryItem] Deleting from bucket '${bucket}': ${filePath}`);
                        const { error: storageError } = await supabase.storage
                            .from(bucket)
                            .remove([filePath]);

                        if (storageError) {
                            console.error(`[removeHistoryItem] Failed to delete image from ${bucket}:`, storageError);
                        } else {
                            console.log(`[removeHistoryItem] Successfully deleted image from ${bucket}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[removeHistoryItem] Failed to parse image URL for deletion:', e);
        }
    }

    const query = supabase.from(HISTORY_TABLE).delete().eq('id', id);
    const { error } = ownerId ? await query.eq('owner_id', ownerId) : await query;
    if (error) throw error;
};

export const clearHistoryItems = async (ownerId?: string) => {
    // 若走后端，建议使用管理页面批量删除，这里留空避免误删
    if (apiBase) return;
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
    if (apiBase && token) {
        const response = await fetch(`${apiBase}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to list users');
        }
        const data = await response.json();
        return data.users;
    }
    if (!token) return [];
    return [];
};

export const upsertUser = async (user: { id?: string; name: string; password: string; }) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (apiBase && token) {
        const response = await fetch(`${apiBase}/api/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ email: user.name, password: user.password, role: 'user' })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error((err.error || 'Failed to create user') + (err.detail ? `: ${err.detail}` : ''));
        }
        return;
    }
};

export const deleteUser = async (id: string) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (apiBase && token) {
        const response = await fetch(`${apiBase}/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to delete user');
        }
        return;
    }
};

export const getSupabaseClient = () => supabase;
export const supabaseAuth = () => supabase?.auth;

export const uploadImage = async (base64Data: string, userId: string): Promise<string | null> => {
    if (!supabase) return null;

    try {
        // 1. Convert Base64 to Blob
        const base64Response = await fetch(base64Data);
        const blob = await base64Response.blob();

        // 2. Generate filename
        // Path: userId/timestamp-random.png
        // We are now in the 'preset' bucket, so we can just use userId/filename
        const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

        // 3. Upload to 'preset' bucket
        const { data, error } = await supabase.storage
            .from('preset')
            .upload(filename, blob, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Upload failed:', error);
            return null;
        }

        // 4. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('preset')
            .getPublicUrl(filename);

        return publicUrl;
    } catch (e) {
        console.error('Error uploading image:', e);
        return null;
    }
};
