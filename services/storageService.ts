import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { HistoryItem, SerializedConnection, SerializedNode, WorkflowAsset } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable shared storage.');
}

const ASSET_TABLE = 'assets';
const HISTORY_TABLE = 'history_items';

type AssetRow = {
    id: string;
    name: string;
    tags: string[] | null;
    notes: string | null;
    nodes: SerializedNode[];
    connections: SerializedConnection[];
    created_at?: string;
};

type HistoryRow = {
    id: string;
    image: string;
    prompt: string;
    context: string;
    node_name: string;
    created_at: string;
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
        connections: row.connections
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
        connections: asset.connections
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
    }));
};

export const insertHistoryItem = async (item: HistoryItem) => {
    if (!supabase) return;
    const { error } = await supabase.from(HISTORY_TABLE).insert({
        id: item.id,
        image: item.image,
        prompt: item.prompt,
        context: item.context,
        node_name: item.nodeName,
        created_at: item.timestamp.toISOString(),
    });
    if (error) throw error;
};

export const removeHistoryItem = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from(HISTORY_TABLE).delete().eq('id', id);
    if (error) throw error;
};

export const clearHistoryItems = async () => {
    if (!supabase) return;
    const { error } = await supabase.from(HISTORY_TABLE).delete();
    if (error) throw error;
};

export const getSupabaseClient = () => supabase;
