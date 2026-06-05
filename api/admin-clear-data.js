const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify caller is a super admin
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Confirm caller is a super admin
  const { data: adminRow } = await supabase
    .from('admin_team')
    .select('is_super_admin')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRow?.is_super_admin) {
    return res.status(403).json({ error: 'Super admin only' });
  }

  const { type } = req.body || {};

  if (type === 'orders') {
    const { error } = await supabase.from('orders').delete().gte('id', 0);
    if (error) return res.status(500).json({ error: error.message });
  } else if (type === 'all') {
    await supabase.from('orders').delete().gte('id', 0);
    await supabase.from('payout_requests').delete().gte('id', 0);
    await supabase.from('support_tickets').delete().gte('id', 0);
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  res.json({ success: true });
};
