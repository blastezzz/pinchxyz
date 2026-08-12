const { redisCommand, isConfigured, getIp, checkRateLimit, scoreCeiling } = require('./_shared');

const KEY = 'pinch:leaderboard';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,8}$/;
const MAX_SCORE = 5000;
const TOP_N = 10;
const SUBMIT_RATE_WINDOW = 60;
const SUBMIT_RATE_MAX = 8;

function parseEntries(raw) {
  const entries = [];
  if (!Array.isArray(raw)) return entries;
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ username: raw[i], score: Number(raw[i + 1]) });
  }
  return entries;
}

async function getTop() {
  const raw = await redisCommand(['zrange', KEY, '0', String(TOP_N - 1), 'REV', 'WITHSCORES']);
  return parseEntries(raw);
}

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(500).json({ error: 'Leaderboard storage is not configured.' });
  }

  try {
    if (req.method === 'GET') {
      const entries = await getTop();
      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const sessionId = String(body?.sessionId || '').trim();
      const username = String(body?.username || '').trim();
      const score = Number(body?.score);

      if (!sessionId) {
        return res.status(400).json({ error: 'Missing session — play a round first.' });
      }
      if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-8 letters, numbers or underscores.' });
      }
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        return res.status(400).json({ error: 'Invalid score.' });
      }

      const ip = getIp(req);
      const rateOk = await checkRateLimit(`pinch:rl:submit:${ip}`, SUBMIT_RATE_WINDOW, SUBMIT_RATE_MAX);
      if (!rateOk) {
        return res.status(429).json({ error: 'Too many submissions, slow down.' });
      }

      const sessionKey = `pinch:session:${sessionId}`;
      const startedAt = await redisCommand(['get', sessionKey]);
      if (!startedAt) {
        return res.status(400).json({ error: 'Session expired — play a new round to submit.' });
      }
      await redisCommand(['del', sessionKey]);

      const elapsedSeconds = (Date.now() - Number(startedAt)) / 1000;
      if (score > scoreCeiling(elapsedSeconds)) {
        return res.status(400).json({ error: 'Score not valid for this session.' });
      }

      await redisCommand(['zadd', KEY, 'GT', 'CH', String(score), username]);
      const entries = await getTop();
      return res.status(200).json({ entries });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error, try again later.' });
  }
};
