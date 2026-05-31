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

  const merchantId  = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase  = process.env.PAYFAST_PASSPHRASE || '';
  const appUrl      = (process.env.APP_URL || '').replace(/\/$/, '');
  const isSandbox   = process.env.PAYFAST_SANDBOX !== 'false';

  if (!merchantId || !merchantKey || !appUrl) {
    return res.status(500).json({ error: 'PayFast not configured' });
  }

  const paymentData = {
    merchant_id:       merchantId,
    merchant_key:      merchantKey,
    return_url:        `${appUrl}/?card=success`,
    cancel_url:        `${appUrl}/?card=cancel`,
    notify_url:        `${appUrl}/api/card-register-notify`,
    // R1 card verification — refunded / kept as platform fee
    amount:            '1.00',
    item_name:         'RunIt Card Registration',
    m_payment_id:      user.id,       // merchant user ID — lets ITN identify them
    custom_str1:       user.id,       // belt-and-suspenders
    // Ad hoc subscription — lets us charge on demand per delivery
    subscription_type: '2',
    frequency:         '3',           // monthly cadence (required by PayFast, won't auto-charge)
    cycles:            '0',           // 0 = indefinite
  };

  paymentData.signature = buildSignature(paymentData, passphrase);

  const baseUrl = isSandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  res.json({ action: baseUrl, fields: paymentData });
};
