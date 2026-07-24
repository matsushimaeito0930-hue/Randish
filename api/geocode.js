const { sendJson } = require('./_hotpepper');
const { geocodeArea } = require('./_geocodeArea');

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

const applyCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
};

const getAreaFromRequest = (req) => {
  const body = readBody(req);
  return String(body.area ?? req.query?.area ?? '').trim().slice(0, 180);
};

module.exports = async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { message: 'Method not allowed.' });
  }

  const area = getAreaFromRequest(req);
  if (!area) {
    return sendJson(res, 400, { message: 'area is required.' });
  }

  try {
    const result = await geocodeArea(area);
    if (!result) {
      return sendJson(res, 404, { message: 'Could not geocode area.' });
    }
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 502, {
      message: error instanceof Error ? error.message : 'Geocoding failed.',
    });
  }
};
