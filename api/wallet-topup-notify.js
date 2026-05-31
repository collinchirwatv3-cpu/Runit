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

  if (!body.signature || body.signature !== expected) {
    console.error('Wallet ITN signature mismatch');
    return res.status(400).send('Bad signature');
  }

  if (body.payment_status !== 'COMPLETE') {
    return res.status(200).send('OK');
  }

  const topupId   = body.m_payment_id;
  const merchantId = body.custom_str1;
  const amount    = parseFloat(body.amount_gross || body.amount || 0);

  if (!topupId || !merchantId || !amount) {
    return res.status(400).send('Missing fields');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // Mark topup as paid
  await supabase
    .from('wallet_topups')
    .update({ status: 'paid', payfast_payment_id: body.pf_payment_id || null })
    .eq('id', topupId)
    .eq('status', 'pending');

  // Upsert merchant wallet — add the amount atomically
  const { error } = await supabase.rpc('credit_merchant_wallet', {
    p_merchant_id: merchantId,
    p_amount:      amount,
  });

  if (error) {
    console.error('credit_merchant_wallet error:', error.message);
    return res.status(500).send('DB error');
  }

  res.status(200).send('OK');
};
