module.exports = (req, res) => {
  const mid = process.env.PAYFAST_MERCHANT_ID || '';
  const mk = process.env.PAYFAST_MERCHANT_KEY || '';
  const sandbox = process.env.PAYFAST_SANDBOX;
  const appUrl = process.env.APP_URL || '';
  res.json({
    merchant_id: mid ? `${mid.slice(0, 3)}***${mid.slice(-2)}` : '(not set)',
    merchant_key: mk ? `${mk.slice(0, 4)}***` : '(not set)',
    sandbox,
    app_url: appUrl,
  });
};
