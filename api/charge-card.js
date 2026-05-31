const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// PayFast REST API signature — different from the form signature
function buildApiSignature(params, passphrase) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
  const toHash = passphrase
    ? `${sorted}&passphrase=${encodeURIComponent(passphrase)}`
    : sorted;
  return crypto.createHash('md5').update(toHash).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the caller's JWT
  const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authToken);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { orderId, amount, itemName } = req.body || {};
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Missing orderId or amount' });
  }

  // Look up merchant's saved card token
  const { data: tokenRow } = await supabase
    .from('merchant_payment_tokens')
    .select('payfast_token')
    .eq('merchant_id', user.id)
    .maybeSingle();

  if (!tokenRow?.payfast_token) {
    return res.status(402).json({ error: 'No card on file', code: 'NO_CARD' });
  }

  const pfMerchantId = process.env.PAYFAST_MERCHANT_ID;
  const passphrase   = process.env.PAYFAST_PASSPHRASE || '';
  const isSandbox    = process.env.PAYFAST_SANDBOX !== 'false';
  const timestamp    = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

  const headerParams = {
    'merchant-id': pfMerchantId,
    'passphrase':  passphrase,
    'timestamp':   timestamp,
    'version':     'v1',
  };

  const signature = buildApiSignature(headerParams, '');

  const baseUrl = isSandbox
    ? 'https://api.payfast.co.za'
    : 'https://api.payfast.co.za'; // same endpoint, sandbox flag is in the headers

  const chargeBody = {
    amount:       Math.round(parseFloat(amount) * 100), // PayFast REST API uses cents
    item_name:    (itemName || 'RunIt Delivery').substring(0, 100),
    m_payment_id: String(orderId),
  };

  const pfRes = await fetch(
    `${baseUrl}/subscriptions/${tokenRow.payfast_token}/adhoc?testing=${isSandbox ? 'true' : 'false'}`,
    {
      method: 'POST',
      headers: {
        'merchant-id': pfMerchantId,
        'passphrase':  passphrase,
        'timestamp':   timestamp,
        'version':     'v1',
        'signature':   signature,
        'Content-Type':'application/json',
      },
      body: JSON.stringify(chargeBody),
    }
  );

  const pfJson = await pfRes.json().catch(() => ({}));

  if (!pfRes.ok || pfJson?.status !== 'success') {
    console.error('PayFast ad-hoc charge failed:', pfJson);
    return res.status(402).json({
      error: pfJson?.data?.message || 'Card charge failed',
      code:  'CHARGE_FAILED',
    });
  }

  // Charge succeeded — update the order to pending
  await supabase
    .from('orders')
    .update({ status: 'pending', payment_status: 'paid' })
    .eq('id', orderId)
    .eq('payment_status', 'unpaid');

  // Notify riders
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (appUrl) {
    fetch(`${appUrl}/api/notify-riders`, { method: 'POST' }).catch(() => {});
  }

  res.json({ success: true });
};
