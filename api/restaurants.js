const { applyCors, sendJson } = require('./_hotpepper');
const { searchMergedRestaurants } = require('./_restaurantSearch');

module.exports = async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { message: 'Method not allowed.' });
  }

  try {
    const restaurants = await searchMergedRestaurants(req.query ?? {});
    return sendJson(res, 200, restaurants);
  } catch (error) {
    const status = error?.statusCode ?? 502;
    return sendJson(res, status, {
      message: error instanceof Error ? error.message : 'Restaurant API request failed.',
    });
  }
};
