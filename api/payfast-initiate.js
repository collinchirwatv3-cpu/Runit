const crypto = require('crypto');

function buildSignature(data, passphrase) {
  const pfString = Object.keys(data)
    .filter((k) => data[k] !== '' && data[k] !== null && data[k] !== undefined)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, '+')}`)
    .join('&');

  const toHash = passphrase
    ? `${pfString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
    : pfString;

  return crypto.createHash('md5').update(toHash).digest('hex');
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

  const params = new URLSearchParams(paymentData);
  res.json({ url: `${baseUrl}?${params.toString()}` });
};
