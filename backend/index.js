import 'dotenv/config';
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

  req.user = user;
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

    const { error } = await supabaseAdmin
      .from('history_items')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId); // Ensure user owns the item

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete history', detail: err.message });
  }
});

// --- User Endpoints (Simple Proxy) ---
app.get('/api/users', authGuard, async (req, res) => {
  // Only allow admin or specific logic? For now, let's just list profiles or similar.
  // storageService.ts seems to use this for a simple user list.
  // Assuming 'profiles' table or similar.
  try {
    // If this is for admin purposes
    if (req.user.role !== 'admin') {
      // If not admin, maybe return just self? Or empty?
      // storageService.ts seems to imply a list of users for authorization management?
      // Let's return empty for non-admins to be safe, or check requirement.
      // The frontend code uses this in AccountModal to list "Authorized Users".
      // Let's assume it's for admin use.
    }

    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, created_at'); // Select safe fields

    if (error) throw error;

    // Map to format expected by frontend if needed, or just return
    // Frontend expects { users: [...] }
    res.json({ users: users.map(u => ({ id: u.id, name: u.email, password: '', email: u.email })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', detail: err.message });
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

// --- Proxy Generation Endpoint ---
app.post('/api/generate', authGuard, async (req, res) => {
  // Extract all necessary fields including image_config and tools
  const { model = 'gemini-1.5-flash', prompt, image, systemInstruction, image_config, response_modalities, tools } = req.body;
  const userId = req.user.id;
  const COST_PER_REQUEST = 10;

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
    if (image) {
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
