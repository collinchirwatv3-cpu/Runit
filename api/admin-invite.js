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
    return res.status(403).json({ error: 'Only the super admin can invite team members' });
  }

  // ── Validate payload ────────────────────────────────────────────────────
  const { email, name } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Guard: already an active admin?
  const { data: existing } = await supabase
    .from('admin_team')
    .select('id, is_active')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (existing?.is_active) {
    return res.status(400).json({ error: 'This person is already an admin' });
  }

  // ── Invite via Supabase Auth ─────────────────────────────────────────────
  const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    email.toLowerCase().trim(),
    { data: { role: 'admin', name: (name || '').trim() } },
  );

  if (inviteErr) return res.status(400).json({ error: inviteErr.message });

  // ── Record in admin_team ────────────────────────────────────────────────
  const { error: dbErr } = await supabase.from('admin_team').upsert({
    user_id:       invite.user.id,
    email:         email.toLowerCase().trim(),
    name:          (name || '').trim(),
    is_super_admin: false,
    invited_by:    caller.email,
    is_active:     true,
  }, { onConflict: 'email' });

  if (dbErr) return res.status(500).json({ error: dbErr.message });

  return res.status(200).json({ success: true, userId: invite.user.id });
};
