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

app.use(cors({
  origin: process.env.ALLOW_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
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
    const client = new Client({ apiKey: process.env.GEMINI_API_KEY });

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

    // Create a safe copy of config for logging
    const logConfig = JSON.parse(JSON.stringify(config));
    // Truncate base64 image data if present in parts
    if (parts && parts.length > 0) {
      parts.forEach(p => {
        if (p.inlineData && p.inlineData.data && p.inlineData.data.length > 100) {
          p.inlineData.data = p.inlineData.data.substring(0, 50) + '...[TRUNCATED]';
        }
      });
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
      res.json({ image: finalImageUrl || responseImage });
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
