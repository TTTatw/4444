import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  JWT_SECRET = 'dev-secret',
  APP_ADMIN_EMAILS = '',
  ALLOW_ORIGIN = '*',
} = process.env;

console.log('--- DEBUG ENV START ---');
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE (first 10):', SUPABASE_SERVICE_ROLE ? SUPABASE_SERVICE_ROLE.substring(0, 10) + '...' : 'MISSING');
console.log('--- DEBUG ENV END ---');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const adminEmailSet = new Set(
  APP_ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN === '*' ? true : ALLOW_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json());

// Auth middleware: validates Supabase access token
async function authGuard(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    // Prefer decoding without verification to extract email quickly
    let email = '';
    try {
      const decoded = jwt.decode(token);
      email = (decoded?.email || '').toLowerCase();
    } catch (_) {
      /* ignore */
    }
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });
    const user = data.user;
    const role =
      user.user_metadata?.role === 'admin' || adminEmailSet.has(email || user.email?.toLowerCase())
        ? 'admin'
        : 'user';
    req.user = { id: user.id, email: user.email, role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Auth failed', detail: err.message });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// Assets
app.get('/api/assets', authGuard, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const from = (page - 1) * pageSize;
    const to = from + Number(pageSize) - 1;
    const base = supabaseAdmin.from('assets').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    const query =
      req.user.role === 'admin'
        ? base
        : base.or(`owner_id.eq.${req.user.id},visibility.eq.public`);
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assets', detail: err.message });
  }
});

app.post('/api/assets', authGuard, async (req, res) => {
  try {
    const payload = req.body;
    const asset = { ...payload, owner_id: req.user.id, visibility: payload.visibility || 'public' };
    const { data, error } = await supabaseAdmin.from('assets').upsert(asset).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upsert asset', detail: err.message });
  }
});

app.delete('/api/assets/:id', authGuard, async (req, res) => {
  try {
    const base = supabaseAdmin.from('assets').delete().eq('id', req.params.id);
    const query = req.user.role === 'admin' ? base : base.eq('owner_id', req.user.id);
    const { error } = await query;
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete asset', detail: err.message });
  }
});

// History
app.get('/api/history', authGuard, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const from = (page - 1) * pageSize;
    const to = from + Number(pageSize) - 1;
    const base = supabaseAdmin.from('history_items').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    const query =
      req.user.role === 'admin'
        ? base
        : base.eq('owner_id', req.user.id);
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history', detail: err.message });
  }
});

app.post('/api/history', authGuard, async (req, res) => {
  try {
    const payload = req.body;
    const item = { ...payload, owner_id: req.user.id };
    const { data, error } = await supabaseAdmin.from('history_items').insert(item).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to insert history', detail: err.message });
  }
});

app.delete('/api/history/:id', authGuard, async (req, res) => {
  try {
    const base = supabaseAdmin.from('history_items').delete().eq('id', req.params.id);
    const query = req.user.role === 'admin' ? base : base.eq('owner_id', req.user.id);
    const { error } = await query;
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete history', detail: err.message });
  }
});

// Admin: list users (basic)
app.get('/api/users', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.user_metadata?.role || 'user',
      created_at: u.created_at,
    }));
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users', detail: err.message });
  }
});

// Admin: create user
app.post('/api/users', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { email, password, role = 'user' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { role },
    });
    if (error) throw error;
    res.json({ user: { id: data.user.id, email: data.user.email, role } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user', detail: err.message });
  }
});

// Admin: delete user
app.delete('/api/users/:id', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', detail: err.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
