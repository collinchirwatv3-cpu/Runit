const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // ── Verify caller is an active super admin ──────────────────────────────
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !caller) return res.status(401).json({ error: 'Unauthorized' });

  const { data: callerRecord } = await supabase
    .from('admin_team')
    .select('is_super_admin')
    .eq('user_id', caller.id)
    .eq('is_active', true)
    .single();

  if (!callerRecord?.is_super_admin) {
    return res.status(403).json({ error: 'Only the super admin can revoke access' });
  }

  // ── Validate payload ────────────────────────────────────────────────────
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (userId === caller.id) {
    return res.status(400).json({ error: 'You cannot revoke your own access' });
  }

  // Guard: never revoke another super admin
  const { data: target } = await supabase
    .from('admin_team')
    .select('is_super_admin, email')
    .eq('user_id', userId)
    .maybeSingle();

  if (target?.is_super_admin) {
    return res.status(400).json({ error: 'Cannot revoke super admin access' });
  }

  // ── Downgrade role in Auth ──────────────────────────────────────────────
  const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { role: 'customer' },
  });

  if (authUpdateErr) return res.status(500).json({ error: authUpdateErr.message });

  // ── Mark inactive in admin_team ─────────────────────────────────────────
  await supabase.from('admin_team').update({ is_active: false }).eq('user_id', userId);

  return res.status(200).json({ success: true });
};
