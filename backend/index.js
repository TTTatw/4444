import 'dotenv/config';

// Set Proxy for Google GenAI (and other Node fetch requests)
// This is required for local development in regions where Google is blocked.
const PROXY_URL = 'http://127.0.0.1:7897';
process.env.HTTPS_PROXY = PROXY_URL;
process.env.HTTP_PROXY = PROXY_URL;

// Also try to patch global dispatcher if using Node 18+ native fetch (undici)
// This is a "best effort" to ensure the proxy is used.
try {
  const { setGlobalDispatcher, ProxyAgent } = await import('undici');
  if (ProxyAgent) {
    const dispatcher = new ProxyAgent(PROXY_URL);
    setGlobalDispatcher(dispatcher);
    console.log(`Global Proxy Agent set to ${PROXY_URL}`);
  }
} catch (e) {
  console.log('Undici ProxyAgent setup skipped (not available or failed):', e.message);
}

import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase Admin Client (Service Role)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Initialize Gemini Client (New SDK)
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getAllowedOrigins = () => {
  const origin = process.env.ALLOW_ORIGIN || '*';
  if (origin.includes(',')) {
    return origin.split(',').map(o => o.trim());
  }
  return origin;
};

app.use(cors({
  origin: getAllowedOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// Auth Middleware
const authGuard = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  // Fetch user profile to get the actual role
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.log('AuthGuard Profile Fetch Error:', profileError.message);
  }

  // FORCE ADMIN for specific email (Emergency Fix -> Permanent DB Fix)
  const isAdminEmail = user.email === '123@123.com';
  let role = profile?.role || 'user';

  if (isAdminEmail && role !== 'admin') {
    console.log(`[AuthGuard] Auto-promoting ${user.email} to admin in database...`);
    await supabaseAdmin
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', user.id);
    role = 'admin';
  }

  // Attach profile role to user object
  req.user = { ...user, role };
  next();
};

// --- Admin Endpoints ---

// Admin: Dashboard Stats
app.get('/api/admin/stats', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { count: userCount } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true });

    const { data: usageData } = await supabaseAdmin.from('usage_logs').select('cost_credits');
    const totalCredits = usageData?.reduce((sum, log) => sum + (log.cost_credits || 0), 0) || 0;

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
      .select('*, profiles(email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const flatData = data.map(row => ({
      ...row,
      user_email: row.profiles?.email || 'Unknown'
    }));

    res.json({ data: flatData, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs', detail: err.message });
  }
});

// --- History Endpoints ---
app.get('/api/history', authGuard, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;
    const userId = req.user.id;

    const { data, error, count } = await supabaseAdmin
      .from('history_items')
      .select('*', { count: 'exact' })
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history', detail: err.message });
  }
});

app.post('/api/history', authGuard, async (req, res) => {
  try {
    const item = req.body;
    // Ensure owner_id is set to the authenticated user
    item.owner_id = req.user.id;

    const { error } = await supabaseAdmin
      .from('history_items')
      .upsert(item);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save history', detail: err.message });
  }
});

app.delete('/api/history/:id', authGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. Fetch the item first to get the image path
    const { data: item, error: fetchError } = await supabaseAdmin
      .from('history_items')
      .select('image')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (fetchError) throw fetchError;

    // 2. Delete from Storage if it's a hosted image
    if (item && item.image && item.image.includes(process.env.SUPABASE_URL)) {
      try {
        // Extract path from URL. 
        // URL format: https://.../storage/v1/object/public/images/userId/timestamp.png
        // We need: userId/timestamp.png
        const urlParts = item.image.split('/images/');
        if (urlParts.length > 1) {
          const filePath = urlParts[1];
          const { error: storageError } = await supabaseAdmin
            .storage
            .from('images')
            .remove([filePath]);

          if (storageError) {
            console.error('Failed to delete image file:', storageError);
          } else {
            console.log('Deleted image file:', filePath);
          }
        }
      } catch (e) {
        console.error('Error parsing/deleting image path:', e);
      }
    }

    // 3. Delete from Database
    const { error } = await supabaseAdmin
      .from('history_items')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete history', detail: err.message });
  }
});

// --- User Endpoints (Simple Proxy) ---
app.get('/api/users', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('*');

    if (error) throw error;

    // Calculate total spent for each user (optional, might be slow if many logs)
    // For now, let's just return profile data. 
    // If we really need total_spent, we'd need a separate aggregation query.
    // Let's do a quick aggregation if possible, or just 0 for now to fix the UI.

    const { data: usage } = await supabaseAdmin.from('usage_logs').select('user_id, cost_credits');
    const usageMap = {};
    usage?.forEach(u => {
      usageMap[u.user_id] = (usageMap[u.user_id] || 0) + (u.cost_credits || 0);
    });

    const mappedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      id: u.id,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
      balance: u.balance,
      status: u.status,
      total_spent: usageMap[u.id] || 0
    }));

    res.json({ users: mappedUsers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', detail: err.message });
  }
});

// Admin: Update User (Balance/Status)
app.patch('/api/admin/users/:id', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { id } = req.params;
    const updates = req.body; // { balance, status }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', detail: err.message });
  }
});

// User: Get Balance
app.get('/api/user/balance', authGuard, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('balance')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    res.json({ balance: profile?.balance || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch balance', detail: err.message });
  }
});

app.post('/api/users', authGuard, async (req, res) => {
  // Creating a user usually means signing them up or adding to a whitelist.
  // Since we use Supabase Auth, we can't just "insert" a user easily without admin API.
  // But here we might be just adding to a profiles table?
  // storageService.ts sends { email, password, role }.
  // This looks like an admin function to create a new user.
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) throw error;

    // Profile creation should be handled by trigger, but we can ensure it exists
    // ...
    res.json({ success: true, user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user', detail: err.message });
  }
});

app.delete('/api/users/:id', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', detail: err.message });
  }
});

// --- Credit System Endpoints ---

// User: Get Usage Logs
app.get('/api/user/logs', authGuard, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const from = (page - 1) * pageSize;
    const to = from + Number(pageSize) - 1;
    const userId = req.user.id;

    const { data, error, count } = await supabaseAdmin
      .from('usage_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs', detail: err.message });
  }
});

// Config: Get Model Costs (Public/Auth)
app.get('/api/config/models', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('model_costs').select('*');
    if (error) throw error;
    res.json({ costs: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch model costs', detail: err.message });
  }
});

// Admin: Update Model Costs
app.post('/api/admin/config/models', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { model_name, cost } = req.body;
    const { error } = await supabaseAdmin
      .from('model_costs')
      .update({ cost })
      .eq('model_name', model_name);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cost', detail: err.message });
  }
});

// User: Request Credits
app.post('/api/user/request-credits', authGuard, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const { error } = await supabaseAdmin
      .from('credit_requests')
      .insert({
        user_id: req.user.id,
        amount,
        status: 'pending'
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit request', detail: err.message });
  }
});

// User: Get My Requests
app.get('/api/user/requests', authGuard, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('credit_requests')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests', detail: err.message });
  }
});

// Admin: Get All Requests
app.get('/api/admin/requests', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    // 1. Fetch all requests
    const { data: requests, error } = await supabaseAdmin
      .from('credit_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 2. Fetch associated user profiles manually to avoid foreign key issues
    const userIds = [...new Set(requests.map(r => r.user_id))];
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    // 3. Create a map for easy lookup
    const profileMap = {};
    profiles.forEach(p => {
      profileMap[p.id] = p.email;
    });

    // 4. Merge data
    const flatData = requests.map(r => ({
      ...r,
      user_email: profileMap[r.user_id] || 'Unknown'
    }));

    res.json({ data: flatData });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests', detail: err.message });
  }
});

// Admin: Resolve Request (Approve/Reject)
app.post('/api/admin/requests/:id/resolve', authGuard, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // 1. Get request details
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('credit_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) throw new Error('Request not found');
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

    // 2. If approved, add balance
    if (status === 'approved') {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('balance')
        .eq('id', request.user_id)
        .single();

      if (profileError) throw profileError;

      const { error: updateBalanceError } = await supabaseAdmin
        .from('profiles')
        .update({ balance: (profile.balance || 0) + request.amount })
        .eq('id', request.user_id);

      if (updateBalanceError) throw updateBalanceError;
    }

    // 3. Update request status
    const { error: updateStatusError } = await supabaseAdmin
      .from('credit_requests')
      .update({ status })
      .eq('id', id);

    if (updateStatusError) throw updateStatusError;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve request', detail: err.message });
  }
});

// --- Proxy Generation Endpoint ---
app.post('/api/generate', authGuard, async (req, res) => {
  // Extract all necessary fields including image_config and tools
  const { model = 'gemini-1.5-flash', prompt, image, systemInstruction, image_config, response_modalities, tools } = req.body;
  const userId = req.user.id;

  // Fetch dynamic cost
  let COST_PER_REQUEST = 0;
  try {
    const { data: costData } = await supabaseAdmin
      .from('model_costs')
      .select('cost')
      .eq('model_name', model)
      .single();
    COST_PER_REQUEST = costData ? costData.cost : 0; // Default to 0 if not found (or handle error)
  } catch (e) {
    console.error('Failed to fetch model cost:', e);
    // Fallback defaults if DB fails? Or just 0.
    // Let's keep 0 to avoid blocking, but log it.
  }

  try {
    // 1. Check Balance
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance, status')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') throw profileError;

    if (!profile) {
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

    // 2. Call Google API (New SDK)
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const parts = [];

    // Handle multiple images (New)
    if (req.body.images && Array.isArray(req.body.images)) {
      console.log(`[Proxy] Received ${req.body.images.length} images in payload`);
      req.body.images.forEach(img => {
        if (typeof img === 'object' && img.inlineData) {
          parts.push(img);
        } else if (typeof img === 'string') {
          parts.push({ inlineData: { mimeType: 'image/png', data: img } });
        }
      });
    }
    // Fallback/Legacy single image support
    else if (image) {
      // If image is passed as a Part object (from frontend buildParts)
      if (typeof image === 'object' && image.inlineData) {
        parts.push(image);
      } else if (typeof image === 'string') {
        // Legacy string base64 support
        parts.push({ inlineData: { mimeType: 'image/png', data: image } });
      }
    }
    if (prompt) parts.push({ text: prompt });

    // Construct Config
    const config = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (tools) config.tools = tools;

    // Correctly map response_modalities (sibling of imageConfig)
    if (response_modalities) {
      config.responseModalities = response_modalities;
    }

    // Correctly map image_config to imageConfig (sibling of responseModalities)
    if (image_config) {
      config.imageConfig = image_config;
    }

    // DEBUG: Log the config being sent to the API
    console.log('--- DEBUG API CONFIG ---');
    console.log('Model:', model);

    // Helper function to sanitize Base64 string
    function sanitizeBase64(inputStr) {
      if (!inputStr) return null;
      // 1. Remove data URL prefix
      let result = inputStr.replace(/^data:image\/\w+;base64,/, '');
      // 2. Remove whitespace and newlines
      result = result.replace(/[\r\n\s]/g, '');
      // 3. Ensure standard Base64 characters (+ /) instead of URL safe (- _)
      result = result.replace(/-/g, '+').replace(/_/g, '/');
      return result;
    }

    // Sanitize image data in parts
    if (parts && parts.length > 0) {
      parts.forEach(p => {
        if (p.inlineData && p.inlineData.data) {
          p.inlineData.data = sanitizeBase64(p.inlineData.data);
        }
      });
    }

    // Create a safe copy of config for logging
    const logConfig = JSON.parse(JSON.stringify(config));
    // Truncate base64 image data if present in parts (for logging only)
    if (parts && parts.length > 0) {
      // Note: We are logging the *sanitized* parts now, but we don't want to mutate 'parts' again for logging
      // The previous loop already mutated 'parts' in place, which is what we want for the API call.
      // For logging, we'll just inspect the already mutated parts.
      // Actually, let's just log a summary to avoid huge logs.
    }

    console.log('Config:', JSON.stringify(logConfig, null, 2));
    console.log('------------------------');

    const result = await client.models.generateContent({
      model: model,
      contents: [{ role: 'user', parts: parts }],
      config: config
    });

    // DEBUG: Log the full result to see structure
    console.log('--- DEBUG GENERATION RESULT ---');
    // console.log(JSON.stringify(result, null, 2)); 
    console.log('--- DEBUG END ---');

    let responseText = '';
    let responseImage = null;

    // Handle Image Response (Base64 Image)
    const isImageModel = model.includes('image');

    if (isImageModel) {
      const candidates = result.candidates || result.response?.candidates;
      const parts = candidates?.[0]?.content?.parts || [];

      // Find the part with image data
      const imagePart = parts.find(p => p.inlineData && p.inlineData.data);

      // Collect text from all parts
      const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');

      if (imagePart) {
        responseImage = imagePart.inlineData.data;
        responseText = textParts || 'Generated image';
      } else {
        // Fallback to text
        responseText = textParts || 'Image generation failed (No image data returned)';
      }
    } else {
      // Text model
      const candidates = result.candidates || result.response?.candidates;
      const parts = candidates?.[0]?.content?.parts || [];
      responseText = parts.filter(p => p.text).map(p => p.text).join('\n');
    }

    // 3. Deduct Balance & Log Usage
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ balance: profile.balance - COST_PER_REQUEST })
      .eq('id', userId);

    if (updateError) console.error('Failed to deduct balance', updateError);

    // --- Image Upload Logic ---
    let finalImageUrl = null;
    if (responseImage) {
      try {
        const timestamp = Date.now();
        const filePath = `${userId}/${timestamp}.png`;

        // Convert Base64 to Buffer
        const buffer = Buffer.from(responseImage, 'base64');

        const { data: uploadData, error: uploadError } = await supabaseAdmin
          .storage
          .from('images')
          .upload(filePath, buffer, {
            contentType: 'image/png',
            upsert: false
          });

        if (uploadError) {
          console.error('Supabase Storage Upload Error:', uploadError);
          // Fallback: return base64 if upload fails, but log error
        } else {
          // Get Public URL
          const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from('images')
            .getPublicUrl(filePath);

          finalImageUrl = publicUrl;
          console.log('Image uploaded to Supabase:', finalImageUrl);
        }
      } catch (uploadErr) {
        console.error('Image upload process failed:', uploadErr);
      }
    }
    // ---------------------------

    await supabaseAdmin.from('usage_logs').insert({
      user_id: userId,
      provider: 'google',
      model: model,
      resource_type: responseImage ? 'image' : 'text',
      cost_credits: COST_PER_REQUEST,
      tokens_input: 0,
      tokens_output: 0,
      status: 'success',
      // Optional: You might want to store the URL in a specific column if you have one, 
      // or just keep it generic. For now, we just log success.
    });

    if (responseImage) {
      // Return URL if upload succeeded, otherwise fallback to base64 (or handle as error)
      // To be safe, if upload failed, we return base64 so user still gets image.
      const imageToSend = finalImageUrl || responseImage;
      console.log('Sending response with image:', finalImageUrl ? 'URL' : `Base64 (len: ${responseImage.length})`);
      res.json({ image: imageToSend });
    } else {
      res.json({ text: responseText });
    }

  } catch (err) {
    console.error('Generation failed:', err);

    // Log to file for debugging
    try {
      const fs = await import('fs');
      const logMessage = `[${new Date().toISOString()}] Error: ${err.message}\nStack: ${err.stack}\n\n`;
      fs.appendFileSync('error.log', logMessage);
    } catch (e) {
      console.error('Failed to write to error log:', e);
    }

    await supabaseAdmin.from('usage_logs').insert({
      user_id: userId,
      provider: 'google',
      model: model,
      resource_type: 'text',
      cost_credits: 0,
      tokens_input: 0,
      tokens_output: 0,
      status: 'failed'
    });
    res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('--- Environment Check ---');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
  console.log('SUPABASE_SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE ? 'Set' : 'Missing');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Set' : 'Missing');
  console.log('ALLOW_ORIGIN:', process.env.ALLOW_ORIGIN || 'Default (*)');
  console.log('-------------------------');
});
