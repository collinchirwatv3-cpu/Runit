const crypto = require('crypto');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, amount, itemName } = req.body || {};
  if (!orderId || !amount) return res.status(400).json({ error: 'Missing orderId or amount' });

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
    amount: parseFloat(amount).toFixed(2),
    item_name: (itemName || 'RunIt Delivery').substring(0, 100),
  };

  paymentData.signature = buildSignature(paymentData, passphrase);

  const baseUrl = isSandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  // Return fields for POST form submission (not GET URL)
  res.json({ action: baseUrl, fields: paymentData });
};
