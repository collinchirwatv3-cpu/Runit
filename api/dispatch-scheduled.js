// Vercel API route — called every minute by Supabase pg_cron via net.http_post
// Flips 'scheduled' orders whose dispatch_at has arrived → 'pending',
// then pushes a notification to each affected merchant.
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).end();

  // Shared secret between this function and the pg_cron SQL
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // 1 ─ Find scheduled orders whose dispatch_at ≤ now
  const { data: due, error: fetchErr } = await supabase
    .from('orders')
    .select('id, user_id')
    .eq('status', 'scheduled')
    .lte('dispatch_at', new Date().toISOString());

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!due?.length) return res.status(200).json({ dispatched: 0 });

  // 2 ─ Flip status → pending, clear dispatch_at
  const ids = due.map(o => o.id);
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'pending', dispatch_at: null })
    .in('id', ids);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // 3 ─ Push notify each unique merchant once
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@runit.app';

  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const merchantIds = [...new Set(due.map(o => o.user_id))];

    for (const mid of merchantIds) {
      const { data: row } = await supabase
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('user_id', mid)
        .maybeSingle();

      if (!row) continue;

      try {
        const sub = typeof row.subscription === 'string'
          ? JSON.parse(row.subscription)
          : row.subscription;

        await webpush.sendNotification(
          sub,
          JSON.stringify({
            title: 'Orders ready to dispatch',
            body:  'You have orders waiting to be dispatched.',
            tag:   'runit-scheduled-dispatch',
          }),
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    }
  }

  return res.status(200).json({ dispatched: ids.length });
};
