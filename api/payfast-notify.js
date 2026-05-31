const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function buildSignature(data, passphrase) {
  const pfString = Object.keys(data)
    .filter((k) => k !== 'signature' && data[k] !== '' && data[k] !== null)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, '+')}`)
    .join('&');

  const toHash = passphrase
    ? `${pfString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
    : pfString;

  return crypto.createHash('md5').update(toHash).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string'
    ? Object.fromEntries(new URLSearchParams(req.body))
    : req.body || {};

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  const expected = buildSignature(body, passphrase);

  if (!body.signature || body.signature !== expected) {
    console.error('PayFast ITN signature mismatch or missing');
    return res.status(400).send('Bad signature');
  }

  if (body.payment_status !== 'COMPLETE') {
    return res.status(200).send('OK');
  }

  const orderId = body.m_payment_id;
  if (!orderId) return res.status(400).send('Missing order ID');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  const { error } = await supabase
    .from('orders')
    .update({ status: 'pending', payment_status: 'paid' })
    .eq('id', orderId)
    .eq('payment_status', 'unpaid');

  if (error) {
    console.error('Supabase update error:', error.message);
    return res.status(500).send('DB error');
  }

  // Fire push notifications to riders (best-effort, don't block the ITN response)
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (appUrl) {
    fetch(`${appUrl}/api/notify-riders`, {
      method: 'POST',
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' },
    }).catch(() => {});
  }

  res.status(200).send('OK');
};
