const { redisCommand, isConfigured } = require('./_shared');

const KEY = 'pinch:game_enabled';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail open: if storage isn't configured or something goes wrong, don't let
  // an outage accidentally take the game down — default to enabled.
  if (!isConfigured()) {
    return res.status(200).json({ enabled: true });
  }

  try {
    const val = await redisCommand(['get', KEY]);
    const enabled = val !== '0' && val !== 'false';
    return res.status(200).json({ enabled });
  } catch (err) {
    return res.status(200).json({ enabled: true });
  }
};
