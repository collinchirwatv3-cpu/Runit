const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Only allow calls from our own server-side code (ITN handlers, cron)
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret || req.headers['x-internal-secret'] !== internalSecret) {
    return res.status(401).end();
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@runit.app';

  if (!vapidPublic || !vapidPrivate) {
    // VAPID not configured yet — silently succeed so orders still work
    return res.status(200).json({ sent: 0, reason: 'VAPID not configured' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('role', 'rider');

  if (!subs?.length) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({
    title: '🏍️ New RunIt Order!',
    body: 'A delivery is available near you — open the app to accept.',
  });

  const results = await Promise.allSettled(
    subs.map(({ subscription }) =>
      webpush.sendNotification(
        typeof subscription === 'string' ? JSON.parse(subscription) : subscription,
        payload,
      )
    )
  );

  // Remove expired subscriptions (HTTP 410 Gone = subscription expired)
  const expired = results
    .map((r, i) => ({ r, id: subs[i].id }))
    .filter(({ r }) => r.status === 'rejected' && r.reason?.statusCode === 410)
    .map(({ id }) => id);

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('id', expired);
  }

  const sent = results.filter(r => r.status === 'fulfilled').length;
  res.status(200).json({ sent, expired: expired.length });
};
