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
  const expected   = buildSignature(body, passphrase);

  if (body.signature && body.signature !== expected) {
    console.error('Card register ITN signature mismatch');
    return res.status(400).send('Bad signature');
  }

  if (body.payment_status !== 'COMPLETE') {
    return res.status(200).send('OK');
  }

  // PayFast sends the subscription token in the ITN
  const pfToken    = body.token;
  const merchantId = body.custom_str1 || body.m_payment_id;

  if (!pfToken || !merchantId) {
    console.error('Card register ITN: missing token or merchant ID', body);
    return res.status(400).send('Missing token or merchant ID');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // Upsert the card token — one card on file per merchant
  const { error } = await supabase
    .from('merchant_payment_tokens')
    .upsert({
      merchant_id:      merchantId,
      payfast_token:    pfToken,
      // PayFast doesn't expose card details in ITN for security,
      // but custom_str fields can carry info set during registration
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'merchant_id' });

  if (error) {
    console.error('merchant_payment_tokens upsert error:', error.message);
    return res.status(500).send('DB error');
  }

  res.status(200).send('OK');
};
