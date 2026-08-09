'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');

/**
 * Tài khoản và phiên đăng nhập.
 *
 * Băm mật khẩu bằng scrypt của thư viện crypto có sẵn trong Node — không cần cài
 * thêm gói nào, và tránh được rắc rối biên dịch native trên shared hosting.
 * scrypt cố tình chậm và ngốn RAM để máy dò mật khẩu không chạy song song hàng loạt được.
 */

const TOKEN_TTL_DAYS = 14;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  // Thà sập lúc khởi động còn hơn chạy với secret rỗng rồi ai cũng giả mạo được token
  if (!s || s.length < 32) throw new Error('JWT_SECRET thiếu hoặc quá ngắn (cần >= 32 ký tự)');
  return s;
}

/* ------------------------------------------------ băm mật khẩu ------------ */

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, SCRYPT.keylen, SCRYPT, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);

    const [, N, r, p, saltHex, keyHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');

    crypto.scrypt(password, salt, expected.length,
      { N: +N, r: +r, p: +p }, (err, key) => {
        // timingSafeEqual: so sánh mất thời gian như nhau dù sai ở ký tự đầu hay cuối,
        // để không lộ thông tin qua thời gian phản hồi
        resolve(!err && crypto.timingSafeEqual(key, expected));
      });
  });
}

/* ------------------------------------------------ kiểm tra đầu vào -------- */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function validateCredentials(username, password) {
  if (!USERNAME_RE.test(String(username || ''))) {
    return 'Tên đăng nhập phải 3–32 ký tự, chỉ gồm chữ cái, số và dấu gạch dưới.';
  }
  if (String(password || '').length < 8) {
    return 'Mật khẩu phải từ 8 ký tự trở lên.';
  }
  if (String(password).length > 200) {
    // scrypt trên chuỗi dài là cách dễ nhất để làm nghẽn CPU server
    return 'Mật khẩu quá dài.';
  }
  return null;
}

/* ------------------------------------------------ chặn dò mật khẩu -------- */

const attempts = new Map(); // key -> { count, firstAt }
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function noteFailure(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    rec.count++;
  }
}

function clearFailures(key) {
  attempts.delete(key);
}

// Dọn bộ nhớ định kỳ để Map không phình mãi
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.firstAt > WINDOW_MS) attempts.delete(k);
}, 5 * 60 * 1000).unref?.();

/* ------------------------------------------------ nghiệp vụ --------------- */

async function register(username, password) {
  const invalid = validateCredentials(username, password);
  if (invalid) throw Object.assign(new Error(invalid), { status: 400 });

  const existing = await db.one('SELECT id FROM accounts WHERE username = ?', [username]);
  if (existing) throw Object.assign(new Error('Tên đăng nhập đã có người dùng.'), { status: 409 });

  const hash = await hashPassword(password);
  const rows = await db.query(
    'INSERT INTO accounts (username, password_hash) VALUES (?, ?)',
    [username, hash]
  );
  return { id: rows.insertId, username };
}

async function login(username, password, ip = '') {
  const key = `${ip}|${username}`;
  if (tooManyAttempts(key)) {
    throw Object.assign(new Error('Sai quá nhiều lần. Thử lại sau 15 phút.'), { status: 429 });
  }

  const account = await db.one(
    'SELECT id, username, password_hash FROM accounts WHERE username = ?',
    [username]
  );

  // Báo lỗi giống hệt nhau cho "không có tài khoản" và "sai mật khẩu" —
  // nếu khác nhau thì kẻ tấn công dò được username nào tồn tại
  const ok = account && await verifyPassword(password, account.password_hash);
  if (!ok) {
    noteFailure(key);
    throw Object.assign(new Error('Tên đăng nhập hoặc mật khẩu không đúng.'), { status: 401 });
  }
  clearFailures(key);

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000);

  await db.query(
    'INSERT INTO sessions (id, account_id, expires_at) VALUES (?, ?, ?)',
    [sessionId, account.id, expiresAt]
  );
  await db.query('UPDATE accounts SET last_login_at = NOW() WHERE id = ?', [account.id]);

  const token = jwt.sign(
    { sub: account.id, usr: account.username },
    jwtSecret(),
    { jwtid: sessionId, expiresIn: `${TOKEN_TTL_DAYS}d` }
  );

  return { token, account: { id: account.id, username: account.username } };
}

/**
 * Xác thực token. Kiểm tra cả chữ ký JWT lẫn phiên trong DB —
 * chỉ có chữ ký thì không thu hồi được token khi cần.
 */
async function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }

  const session = await db.one(
    'SELECT id, revoked, expires_at FROM sessions WHERE id = ?',
    [payload.jti]
  );
  if (!session || session.revoked || new Date(session.expires_at) < new Date()) return null;

  return { id: payload.sub, username: payload.usr, sessionId: payload.jti };
}

async function logout(sessionId) {
  await db.query('UPDATE sessions SET revoked = 1 WHERE id = ?', [sessionId]);
}

/** Xóa phiên đã hết hạn — gọi định kỳ để bảng sessions không phình vô hạn. */
async function purgeExpiredSessions() {
  const res = await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
  return res.affectedRows || 0;
}

module.exports = {
  register, login, logout, verifyToken, purgeExpiredSessions,
  hashPassword, verifyPassword, validateCredentials,
};
