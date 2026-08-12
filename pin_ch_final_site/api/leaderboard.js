const BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'pinch:leaderboard';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,8}$/;
const MAX_SCORE = 5000;
const TOP_N = 10;

async function redisCommand(parts) {
  const path = parts.map(p => encodeURIComponent(p)).join('/');
  const r = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

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
  if (!BASE || !TOKEN) {
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
      const username = String(body?.username || '').trim();
      const score = Number(body?.score);

      if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-8 letters, numbers or underscores.' });
      }
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        return res.status(400).json({ error: 'Invalid score.' });
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
