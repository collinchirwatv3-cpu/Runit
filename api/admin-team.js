// Handles both admin invite and admin revoke (merged to stay within Vercel function limit)
const { createClient } = require('@supabase/supabase-js');

async function verifySuperAdmin(supabase, token) {
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data } = await supabase.from('admin_team').select('is_super_admin').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  return data?.is_super_admin ? user : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const caller = await verifySuperAdmin(supabase, token);
  if (!caller) return res.status(403).json({ error: 'Super admin only' });

  const { action, email, name, userId } = req.body || {};

  // ── INVITE ──────────────────────────────────────────────────────────────
  if (action === 'invite') {
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { data: existing } = await supabase.from('admin_team').select('id, is_active').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (existing?.is_active) return res.status(400).json({ error: 'Already an admin' });
    const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email.toLowerCase().trim(), { data: { role: 'admin', name: (name || '').trim() } });
    if (inviteErr) return res.status(400).json({ error: inviteErr.message });
    const { error: dbErr } = await supabase.from('admin_team').upsert({ user_id: invite.user.id, email: email.toLowerCase().trim(), name: (name || '').trim(), is_super_admin: false, invited_by: caller.email, is_active: true }, { onConflict: 'email' });
    if (dbErr) return res.status(500).json({ error: dbErr.message });
    return res.status(200).json({ success: true, userId: invite.user.id });
  }

  // ── REVOKE ──────────────────────────────────────────────────────────────
  if (action === 'revoke') {
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (userId === caller.id) return res.status(400).json({ error: 'Cannot revoke your own access' });
    const { data: target } = await supabase.from('admin_team').select('is_super_admin').eq('user_id', userId).maybeSingle();
    if (target?.is_super_admin) return res.status(400).json({ error: 'Cannot revoke super admin' });
    await supabase.auth.admin.updateUserById(userId, { user_metadata: { role: 'customer' } });
    await supabase.from('admin_team').update({ is_active: false }).eq('user_id', userId);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
