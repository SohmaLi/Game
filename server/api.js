'use strict';

const express = require('express');
const auth = require('./auth');
const characters = require('./characters');
const boons = require('./data/boons');
const nations = require('./data/nations');

/**
 * REST API cho phần ngoài trận: đăng ký, đăng nhập, chọn nhân vật.
 * Phần trong trận đi qua Socket.IO chứ không qua đây.
 */

/** Bọc handler async để lỗi ném ra được chuyển sang middleware xử lý lỗi. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });

  const account = await auth.verifyToken(token);
  if (!account) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });

  req.account = account;
  next();
}

function build() {
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));

  /* ---------------------------------------------- dữ liệu tĩnh ---------- */

  // Client cần danh sách này để dựng màn tạo nhân vật
  router.get('/meta', (req, res) => {
    res.json({
      boons: boons.all(),
      nations: nations.all().map((n) => ({
        id: n.id, name: n.name, trait: n.trait, magic: n.magic,
        privilege: { name: n.privilege.name, desc: n.privilege.desc },
      })),
      maxCharacters: characters.MAX_CHARACTERS,
      maxRerolls: boons.MAX_REROLLS,
    });
  });

  /* ---------------------------------------------- tài khoản ------------- */

  router.post('/register', wrap(async (req, res) => {
    const { username, password } = req.body || {};
    await auth.register(username, password);
    // Đăng ký xong đăng nhập luôn, đỡ bắt người chơi gõ lại
    const result = await auth.login(username, password, req.ip);
    res.status(201).json(result);
  }));

  router.post('/login', wrap(async (req, res) => {
    const { username, password } = req.body || {};
    res.json(await auth.login(username, password, req.ip));
  }));

  router.post('/logout', requireAuth, wrap(async (req, res) => {
    await auth.logout(req.account.sessionId);
    res.json({ ok: true });
  }));

  router.get('/me', requireAuth, wrap(async (req, res) => {
    res.json({
      account: { id: req.account.id, username: req.account.username },
      characters: await characters.list(req.account.id),
    });
  }));

  /* ---------------------------------------------- nhân vật -------------- */

  router.get('/characters', requireAuth, wrap(async (req, res) => {
    res.json({ characters: await characters.list(req.account.id) });
  }));

  router.post('/characters', requireAuth, wrap(async (req, res) => {
    const { name, nation } = req.body || {};
    res.status(201).json({ character: await characters.create(req.account.id, name, nation) });
  }));

  router.post('/characters/:id/reroll', requireAuth, wrap(async (req, res) => {
    res.json({ character: await characters.rerollBoon(req.account.id, req.params.id) });
  }));

  router.post('/characters/:id/lock-boon', requireAuth, wrap(async (req, res) => {
    res.json({ character: await characters.lockBoon(req.account.id, req.params.id) });
  }));

  /* ---------------------------------------------- lỗi ------------------- */

  router.use((err, req, res, _next) => {
    const status = err.status || 500;
    // Lỗi 500 là lỗi của mình, phải ghi log; lỗi 4xx là người dùng nhập sai, không cần
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({
      error: status >= 500 ? 'Lỗi máy chủ. Thử lại sau.' : err.message,
    });
  });

  return router;
}

module.exports = { build, requireAuth };
