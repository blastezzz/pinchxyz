const { randomUUID } = require('crypto');
const { redisCommand, isConfigured, getIp, checkRateLimit } = require('./_shared');

const SESSION_TTL = 900;
const RATE_WINDOW = 60;
const RATE_MAX = 20;

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(500).json({ error: 'Leaderboard storage is not configured.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ip = getIp(req);
    const ok = await checkRateLimit(`pinch:rl:session:${ip}`, RATE_WINDOW, RATE_MAX);
    if (!ok) {
      return res.status(429).json({ error: 'Too many requests, slow down.' });
    }

    const sessionId = randomUUID();
    await redisCommand(['set', `pinch:session:${sessionId}`, String(Date.now()), 'EX', String(SESSION_TTL)]);
    return res.status(200).json({ sessionId });
  } catch (err) {
    return res.status(500).json({ error: 'Server error, try again later.' });
  }
};
