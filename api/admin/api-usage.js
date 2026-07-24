const { sendJson } = require('../_hotpepper');
const {
  apiUsageSnapshot,
  incrementLocalApiUsage,
  incrementPersistentApiUsage,
  verifyAdminPassword,
  verifyUsageSecret,
} = require('../_apiUsage');
const { googlePlacesDiagnostics } = require('../_googlePlaces');

const readBody = (req) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Randish-Admin-Password, X-Randish-Usage-Secret');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'POST') {
    if (!verifyUsageSecret(req)) {
      return sendJson(res, 401, { message: 'Usage secret is required.' });
    }
    const body = readBody(req);
    incrementLocalApiUsage(body.key, body.count);
    await incrementPersistentApiUsage(body.key, body.count);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { message: 'Method not allowed.' });
  }
  if (!verifyAdminPassword(req)) {
    return sendJson(res, 401, { message: 'Admin password is required.' });
  }

  const google = googlePlacesDiagnostics();
  const usage = await apiUsageSnapshot({
    googleAvailable: google.available,
    hotPepperAvailable: Boolean(process.env.HOTPEPPER_API_KEY),
    geoapifyAvailable: Boolean(process.env.GEOAPIFY_API_KEY),
  });
  return sendJson(res, 200, usage);
};
