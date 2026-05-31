const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function phpUrlencode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildSignature(data, passphrase) {
  const pfString = Object.keys(data)
    .filter((k) => data[k] !== '' && data[k] !== null && data[k] !== undefined)
    .sort()
    .map((k) => `${k}=${phpUrlencode(String(data[k]))}`)
    .join('&');
  const toHash = passphrase ? `${pfString}&passphrase=${phpUrlencode(passphrase)}` : pfString;
  return crypto.createHash('md5').update(toHash).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify merchant JWT
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { amount } = req.body || {};
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) < 50) {
    return res.status(400).json({ error: 'Minimum top-up is R50' });
  }

  const merchantId  = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase  = process.env.PAYFAST_PASSPHRASE || '';
  const appUrl      = (process.env.APP_URL || '').replace(/\/$/, '');
  const isSandbox   = process.env.PAYFAST_SANDBOX !== 'false';

  if (!merchantId || !merchantKey || !appUrl) {
    return res.status(500).json({ error: 'PayFast not configured' });
  }

  // Create a wallet_topup record so the ITN can find it
  const { data: topup, error: dbErr } = await supabase
    .from('wallet_topups')
    .insert([{
      merchant_id: user.id,
      amount: parseFloat(amount).toFixed(2),
      status: 'pending',
    }])
    .select('id')
    .single();

  if (dbErr || !topup) {
    console.error('wallet_topup insert error:', dbErr?.message);
    return res.status(500).json({ error: 'Failed to create top-up record' });
  }

  const paymentData = {
    merchant_id:  merchantId,
    merchant_key: merchantKey,
    return_url:   `${appUrl}/?wallet=success`,
    cancel_url:   `${appUrl}/?wallet=cancel`,
    notify_url:   `${appUrl}/api/wallet-topup-notify`,
    m_payment_id: String(topup.id),
    amount:       parseFloat(amount).toFixed(2),
    item_name:    'RunIt Wallet Top-Up',
    custom_str1:  user.id, // merchant_id for the ITN
  };

  paymentData.signature = buildSignature(paymentData, passphrase);

  const baseUrl = isSandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  res.json({ action: baseUrl, fields: paymentData });
};
