import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  JWT_SECRET = 'dev-secret',
  APP_ADMIN_EMAILS = '',
  ALLOW_ORIGIN = '*',
  GEMINI_API_KEY,
} = process.env;

console.log('--- DEBUG ENV START ---');
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE (LAST 10):', SUPABASE_SERVICE_ROLE ? '...' + SUPABASE_SERVICE_ROLE.slice(-10) : 'MISSING');
console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? 'SET (Starts with ' + GEMINI_API_KEY.substring(0, 4) + '...)' : 'MISSING');
console.log('--- DEBUG ENV END ---');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const adminEmailSet = new Set(
  APP_ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);

// Initialize Gemini Client
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN === '*' ? true : ALLOW_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: '50mb' })); // Increase limit for image uploads

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
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const base = supabaseAdmin
      .from('history_items')
      .select('*')
      .order('created_at', { ascending: false });
    const query =
      req.user.role === 'admin'
        ? base
        : base.eq('owner_id', req.user.id);
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    res.json({ data });
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

// Admin: list users (enhanced with profile data)
app.get('/api/users', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    // 1. Fetch Auth Users
    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) throw authError;

    // 2. Fetch Profiles
    const userIds = users.map(u => u.id);
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, balance, status, total_spent')
      .in('id', userIds);

    if (profileError) throw profileError;

    // 3. Merge Data
    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const result = users.map(u => {
      const profile = profileMap.get(u.id) || {};
      return {
        id: u.id,
        email: u.email,
        role: u.user_metadata?.role || 'user',
        created_at: u.created_at,
        balance: profile.balance || 0,
        status: profile.status || 'active',
        total_spent: profile.total_spent || 0
      };
    });

    res.json({ users: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users', detail: err.message });
  }
});

// Admin: Update User (Balance/Status)
app.patch('/api/admin/users/:id', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { balance, status } = req.body;
  try {
    const updates = {};
    if (balance !== undefined) updates.balance = balance;
    if (status !== undefined) updates.status = status;

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.params.id);

    if (error) throw error;

    // If banning, also ban in Auth (optional, but good practice)
    if (status === 'banned') {
      await supabaseAdmin.auth.admin.updateUserById(req.params.id, { ban_duration: '876000h' }); // 100 years
    } else if (status === 'active') {
      await supabaseAdmin.auth.admin.updateUserById(req.params.id, { ban_duration: 'none' });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', detail: err.message });
  }
});

// Admin: System Stats
app.get('/api/admin/stats', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    // Total Users
    const { count: userCount, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (userError) throw userError;

    // Total Revenue (Credits Consumed)
    const { data: usageData, error: usageError } = await supabaseAdmin
      .from('usage_logs')
      .select('cost_credits');

    if (usageError) throw usageError;
    const totalCredits = usageData.reduce((sum, row) => sum + (row.cost_credits || 0), 0);

    // Active Users (Last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: activeUsersData } = await supabaseAdmin
      .from('usage_logs')
      .select('user_id')
      .gt('created_at', oneDayAgo);

    const activeUsers = new Set(activeUsersData?.map(u => u.user_id)).size;

    res.json({
      totalUsers: userCount,
      totalCreditsConsumed: totalCredits,
      activeUsers24h: activeUsers
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats', detail: err.message });
  }
});

// Admin: Usage Logs
app.get('/api/admin/logs', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { page = 1, pageSize = 50 } = req.query;
    const from = (page - 1) * pageSize;
    const to = from + Number(pageSize) - 1;

    const { data, error, count } = await supabaseAdmin
      .from('usage_logs')
      .select('*, profiles(email)', { count: 'exact' }) // Join with profiles to get email
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // Flatten email
    const flatData = data.map(row => ({
      ...row,
      user_email: row.profiles?.email || 'Unknown'
    }));

    res.json({ data: flatData, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs', detail: err.message });
  }
});

// --- Proxy Generation Endpoint ---
app.post('/api/generate', authGuard, async (req, res) => {
  const { model = 'gemini-1.5-flash', prompt, image, systemInstruction } = req.body;
  const userId = req.user.id;
  const COST_PER_REQUEST = 10; // Define cost per request

  try {
    // 1. Check Balance
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance, status')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') throw profileError;

    if (!profile) {
      // Auto-create profile if missing
      console.log(`Profile missing for user ${userId}, creating one...`);
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          email: req.user.email,
          role: 'user',
          balance: 100,
          status: 'active'
        })
        .select()
        .single();

      if (createError) throw new Error(`Failed to create profile: ${createError.message}`);
      profile = newProfile;
    }
    if (profile.status !== 'active') return res.status(403).json({ error: 'Account not active' });
    if (profile.balance < COST_PER_REQUEST) return res.status(402).json({ error: 'Insufficient balance' });

    // 2. Call Google API
    const parts = [];
    if (prompt) parts.push({ text: prompt });
    if (image) {
      parts.push(image);
    }

    // Model Mapping (Frontend names -> Official API names)
    let targetModel = model;
    if (model === 'gemini-3-pro-image-preview') {
      targetModel = 'gemini-3-pro-image-preview';
    } else if (model === 'gemini-2.5-flash-image') {
      targetModel = 'gemini-2.5-flash-image';
    } else if (model === 'gemini-3-pro-preview') {
      targetModel = 'gemini-3-pro-preview';
    } else if (model === 'gemini-2.5-flash') {
      targetModel = 'gemini-2.5-flash';
    }

    const request = {
      model: targetModel,
      contents: { parts }
    };

    const result = await genAI.models.generateContent(request);

    // DEBUG: Log the full result to see structure
    console.log('--- DEBUG GENERATION RESULT ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('--- DEBUG END ---');

    let responseText = '';
    let responseImage = null;

    // Handle Image Response (Base64 Image)
    const isImageModel = targetModel.includes('image');

    if (isImageModel) {
      const imagePart = result.candidates?.[0]?.content?.parts?.[0];
      if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
        responseImage = imagePart.inlineData.data;
        responseText = 'Generated image';
      } else {
        responseText = result.text || 'Image generation failed (No image data returned)';
      }
    } else {
      responseText = result.text;
    }

    // 3. Deduct Balance & Log Usage
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ balance: profile.balance - COST_PER_REQUEST })
      .eq('id', userId);

    if (updateError) console.error('Failed to deduct balance', updateError);

    await supabaseAdmin.from('usage_logs').insert({
      user_id: userId,
      provider: 'google',
      model: targetModel,
      resource_type: responseImage ? 'image' : 'text',
      cost_credits: COST_PER_REQUEST,
      tokens_input: 0,
      tokens_output: 0,
      status: 'success'
    });

    if (responseImage) {
      res.json({ image: responseImage });
    } else {
      res.json({ text: responseText });
    }

  } catch (err) {
    console.error('Generation failed:', err);
    await supabaseAdmin.from('usage_logs').insert({
      user_id: userId,
      provider: 'google',
      model: model,
      resource_type: 'text',
      cost_credits: 0,
      status: 'failed',
      error_message: err.message
    });
    res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
