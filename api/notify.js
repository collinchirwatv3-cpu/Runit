// Send a push notification to a specific user by user_id
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@runit.app';

  if (!vapidPublic || !vapidPrivate) {
    // VAPID not configured — silently succeed so app flow is unaffected
    return res.status(200).json({ sent: false, reason: 'VAPID not configured' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // Require a valid caller session
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user: caller } } = await supabase.auth.getUser(token);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { userId, title, body, tag } = req.body || {};
  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title are required' });
  }

  // Look up the recipient's push subscription
  const { data: row } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return res.status(200).json({ sent: false, reason: 'No subscription' });

  try {
    const sub = typeof row.subscription === 'string'
      ? JSON.parse(row.subscription)
      : row.subscription;

    await webpush.sendNotification(
      sub,
      JSON.stringify({ title, body: body || '', tag: tag || 'runit-status' }),
    );

    return res.status(200).json({ sent: true });
  } catch (err) {
    // 404/410 = subscription expired — clean it up
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', row.id);
    }
    return res.status(200).json({ sent: false, error: err.message });
  }
};
