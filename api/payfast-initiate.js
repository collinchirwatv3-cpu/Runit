const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('./_ratelimit');

// PayFast signature: alphabetical key sort, PHP-style urlencode (spaces → +)
function buildSignature(data, passphrase) {
  const pfString = Object.keys(data)
    .filter((k) => data[k] !== '' && data[k] !== null && data[k] !== undefined)
    .sort()
    .map((k) => `${k}=${phpUrlencode(String(data[k]))}`)
    .join('&');

  const toHash = passphrase
    ? `${pfString}&passphrase=${phpUrlencode(passphrase)}`
    : pfString;

  return crypto.createHash('md5').update(toHash).digest('hex');
}

// Matches PHP urlencode() exactly
function phpUrlencode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 15 payment initiations per IP per minute
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = rateLimit(ip, 'payfast-initiate', 15, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfterSec);
    return res.status(429).json({ error: 'Too many requests — please wait a moment.' });
  }

  // Verify caller's JWT — only the order owner can initiate payment
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { orderId, itemName } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  // Look up price from DB — never trust client-supplied amount
  const { data: order } = await supabase
    .from('orders')
    .select('price, user_id, payment_status')
    .eq('id', orderId)
    .single();

  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
  if (order.payment_status === 'paid') return res.status(409).json({ error: 'Already paid' });

  const amount = parseFloat(order.price);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid order price' });

  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const isSandbox = process.env.PAYFAST_SANDBOX !== 'false';

  if (!merchantId || !merchantKey || !appUrl) {
    return res.status(500).json({ error: 'PayFast not configured' });
  }

  const paymentData = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${appUrl}/?payment=success&order=${orderId}`,
    cancel_url: `${appUrl}/?payment=cancel&order=${orderId}`,
    notify_url: `${appUrl}/api/payfast-notify`,
    m_payment_id: String(orderId),
    amount: amount.toFixed(2),
    item_name: (itemName || 'RunIt Delivery').substring(0, 100),
  };

  paymentData.signature = buildSignature(paymentData, passphrase);

  const baseUrl = isSandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  // Return fields for POST form submission (not GET URL)
  res.json({ action: baseUrl, fields: paymentData });
};
