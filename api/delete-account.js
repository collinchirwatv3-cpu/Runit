const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('./_ratelimit');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 3 attempts per IP per minute (very strict — irreversible action)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = rateLimit(ip, 'delete-account', 3, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfterSec);
    return res.status(429).json({ error: 'Too many requests — please wait a moment.' });
  }

  // Verify the caller's JWT so only the owner can delete their account
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Verify the JWT and get the user's ID using the anon client
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return res.status(500).json({ error: 'Server misconfigured' });
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Delete the user using the admin (service role) client
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('Delete user error:', error.message);
    return res.status(500).json({ error: 'Failed to delete account' });
  }

  res.status(200).json({ success: true });
};
