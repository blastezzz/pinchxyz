const BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function redisCommand(parts) {
  const path = parts.map(p => encodeURIComponent(p)).join('/');
  const r = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function isConfigured() {
  return Boolean(BASE && TOKEN);
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress) || 'unknown';
}

// Returns true if the request is within the allowed rate, false if it should be rejected.
async function checkRateLimit(key, windowSeconds, maxCount) {
  const count = await redisCommand(['incr', key]);
  if (count === 1) {
    await redisCommand(['expire', key, String(windowSeconds)]);
  }
  return count <= maxCount;
}

// Mirrors the client's difficulty curve (see game.html) to estimate the highest
// score that could plausibly be reached in the given number of seconds, assuming
// a perfect run where every single hat is golden and caught. Used as an upper
// bound to reject scores that could not have been achieved in the elapsed time.
function maxPossibleScore(elapsedSeconds) {
  if (elapsedSeconds <= 0) return 0;
  const stepMs = 50;
  const totalMs = Math.min(elapsedSeconds, 3600) * 1000;
  let simMs = 0;
  let spawnTimer = 0;
  let hats = 0;
  while (simMs < totalMs) {
    const seconds = simMs / 1000;
    const interval = Math.max(380, 950 - seconds * 18);
    spawnTimer += stepMs;
    if (spawnTimer > interval) {
      spawnTimer = 0;
      hats++;
    }
    simMs += stepMs;
  }
  return hats * 3;
}

function scoreCeiling(elapsedSeconds) {
  return maxPossibleScore(elapsedSeconds) * 1.15 + 5;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str) {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const value = BASE58_ALPHABET.indexOf(str[i]);
    if (value === -1) return null;
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length - 1 && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return bytes.reverse();
}

// A Solana address is a base58-encoded ed25519 public key: always 32 raw bytes.
function isValidSolanaAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 32 || addr.length > 44) return false;
  const decoded = base58Decode(addr);
  return !!decoded && decoded.length === 32;
}

module.exports = { redisCommand, isConfigured, getIp, checkRateLimit, scoreCeiling, isValidSolanaAddress };
