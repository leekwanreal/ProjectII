// Xác thực nhân viên: mật khẩu băm scrypt, token ký HMAC-SHA256 có hạn dùng.
const crypto = require('crypto');
const db = require('../db/connection');
const { TOKEN_SECRET, TOKEN_TTL_HOURS } = require('../config');
const { AppError } = require('./errors');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');

function issueToken(user) {
  const payload = b64(JSON.stringify({ uid: user.user_id, role: user.role, name: user.full_name, exp: Date.now() + TOKEN_TTL_HOURS * 3600e3 }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

function login(username, password) {
  const user = db.get().prepare('SELECT * FROM staff_users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.');
  }
  return { token: issueToken(user), user: { id: user.user_id, username: user.username, full_name: user.full_name, role: user.role } };
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, login };
