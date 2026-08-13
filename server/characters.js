'use strict';

const db = require('./db');
const boons = require('./data/boons');
const nations = require('./data/nations');

/**
 * Tạo và quản lý nhân vật.
 *
 * Quy tắc Đặc Ân (đã chốt trong DESIGN.md §2.2):
 *   - Bốc ngẫu nhiên lúc tạo nhân vật
 *   - Rút lại tối đa 3 lần
 *   - Sau lần rút thứ 3, hoặc khi người chơi bấm giữ → khóa vĩnh viễn
 *
 * Toàn bộ việc bốc đều làm ở server. Nếu để client bốc thì người chơi chỉ cần
 * gọi lại hàm bốc trong console cho tới khi ra đặc ân mình thích.
 */

const MAX_CHARACTERS = 3;
// Cho phép chữ có dấu tiếng Việt, chữ số và khoảng trắng đơn ở giữa
const NAME_RE = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;

function validateName(name) {
  const n = String(name || '').trim();
  if (n.length < 3 || n.length > 16) return 'Tên nhân vật phải từ 3 đến 16 ký tự.';
  if (!NAME_RE.test(n)) return 'Tên nhân vật chỉ gồm chữ và số, không có ký tự đặc biệt.';
  return null;
}

/** Chuyển bản ghi DB thành dạng gửi cho client. */
function present(row) {
  if (!row) return null;
  const nation = nations.get(row.nation);
  return {
    id: row.id,
    name: row.name,
    nation: nation && {
      id: nation.id, name: nation.name,
      privilege: { name: nation.privilege.name, desc: nation.privilege.desc },
    },
    boon: boons.publicView(boons.get(row.boon_id)),
    boonRerollsLeft: row.boon_locked ? 0 : boons.MAX_REROLLS - row.boon_rerolls,
    boonLocked: !!row.boon_locked,
    class: row.class,
    level: row.level,
    exp: row.exp,
    gold: row.gold,
    stats: {
      str: row.stat_str, int: row.stat_int, vit: row.stat_vit,
      agi: row.stat_agi, wil: row.stat_wil, points: row.stat_points,
    },
    hp: row.hp,
    mana: row.mana,
    pos: { x: row.pos_x, y: row.pos_y },

    // Tiến trình lưu dưới dạng JSON — xem ghi chú trong db/schema.sql
    learned: parseJson(row.learned, []),
    carried: parseJson(row.carried, []),
    codex: parseJson(row.codex, null),
    books: parseJson(row.books, []),
    skillRanks: parseJson(row.skill_ranks, {}),
    bookRanks: parseJson(row.book_ranks, {}),
    mastery: parseJson(row.mastery, {}),
    equipped: parseJson(row.equipped, null),
    bag: parseJson(row.bag, []),
    playedAt: row.played_at,
  };
}

/**
 * Cột JSON của MariaDB thực chất là LONGTEXT, driver trả về chuỗi. Dữ liệu hỏng
 * (do đổi định dạng giữa các phiên bản) thì rơi về mặc định thay vì làm sập cả
 * lượt đăng nhập — mất một phần tiến trình vẫn hơn là không vào được game.
 */
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function list(accountId) {
  const rows = await db.query(
    'SELECT * FROM characters WHERE account_id = ? ORDER BY id',
    [accountId]
  );
  return rows.map(present);
}

async function getOwned(accountId, characterId) {
  return db.one(
    'SELECT * FROM characters WHERE id = ? AND account_id = ?',
    [characterId, accountId]
  );
}

async function create(accountId, name, nationId) {
  const invalid = validateName(name);
  if (invalid) throw Object.assign(new Error(invalid), { status: 400 });

  if (!nations.isValid(nationId)) {
    throw Object.assign(new Error('Quốc gia không hợp lệ.'), { status: 400 });
  }

  const count = await db.one(
    'SELECT COUNT(*) AS c FROM characters WHERE account_id = ?', [accountId]
  );
  if (count.c >= MAX_CHARACTERS) {
    throw Object.assign(
      new Error(`Mỗi tài khoản chỉ được tối đa ${MAX_CHARACTERS} nhân vật.`), { status: 409 }
    );
  }

  const trimmed = String(name).trim();
  const taken = await db.one('SELECT id FROM characters WHERE name = ?', [trimmed]);
  if (taken) throw Object.assign(new Error('Tên nhân vật đã có người dùng.'), { status: 409 });

  const boon = boons.roll();

  const res = await db.query(
    `INSERT INTO characters (account_id, name, nation, boon_id)
     VALUES (?, ?, ?, ?)`,
    [accountId, trimmed, nationId, boon.id]
  );

  return present(await db.one('SELECT * FROM characters WHERE id = ?', [res.insertId]));
}

/**
 * Rút lại Đặc Ân. Loại trừ đặc ân hiện tại khỏi lần bốc — bốc lại ra đúng cái vừa
 * có thì người chơi sẽ nghĩ hệ thống hỏng, dù về mặt xác suất là bình thường.
 */
async function rerollBoon(accountId, characterId) {
  const row = await getOwned(accountId, characterId);
  if (!row) throw Object.assign(new Error('Không tìm thấy nhân vật.'), { status: 404 });

  if (row.boon_locked) {
    throw Object.assign(new Error('Đặc Ân đã khóa vĩnh viễn, không rút lại được.'), { status: 409 });
  }
  if (row.boon_rerolls >= boons.MAX_REROLLS) {
    throw Object.assign(new Error('Đã hết lượt rút lại.'), { status: 409 });
  }

  const next = boons.roll(row.boon_id);
  const rerolls = row.boon_rerolls + 1;
  // Dùng hết lượt thì khóa luôn, không bắt người chơi bấm thêm một nút nữa
  const locked = rerolls >= boons.MAX_REROLLS ? 1 : 0;

  await db.query(
    'UPDATE characters SET boon_id = ?, boon_rerolls = ?, boon_locked = ? WHERE id = ?',
    [next.id, rerolls, locked, characterId]
  );

  return present(await db.one('SELECT * FROM characters WHERE id = ?', [characterId]));
}

/** Người chơi chủ động giữ Đặc Ân hiện tại — khóa sớm, bỏ số lượt rút còn lại. */
async function lockBoon(accountId, characterId) {
  const row = await getOwned(accountId, characterId);
  if (!row) throw Object.assign(new Error('Không tìm thấy nhân vật.'), { status: 404 });

  await db.query('UPDATE characters SET boon_locked = 1 WHERE id = ?', [characterId]);
  return present(await db.one('SELECT * FROM characters WHERE id = ?', [characterId]));
}

/** Lưu vị trí khi người chơi rời thế giới, để lần sau vào lại đúng chỗ. */
async function savePosition(characterId, x, y) {
  await db.query('UPDATE characters SET pos_x = ?, pos_y = ? WHERE id = ?',
    [Number(x) || 0, Number(y) || 0, characterId]);
}

/**
 * Ghi toàn bộ tiến trình của một nhân vật xuống database.
 *
 * Gọi ở ba thời điểm: sau mỗi trận, khi người chơi thoát, và định kỳ. Chỉ lưu
 * lúc thoát là không đủ — mất kết nối đột ngột hoặc server restart sẽ nuốt mất
 * cả buổi chơi.
 */
async function saveProgress(characterId, p) {
  if (!characterId) return false;

  await db.query(
    `UPDATE characters SET
       class = ?, level = ?, exp = ?, gold = ?,
       stat_str = ?, stat_int = ?, stat_vit = ?, stat_agi = ?, stat_wil = ?, stat_points = ?,
       pos_x = ?, pos_y = ?,
       learned = ?, carried = ?, codex = ?, books = ?, equipped = ?, bag = ?, skill_ranks = ?, book_ranks = ?, mastery = ?,
       played_at = NOW()
     WHERE id = ?`,
    [
      p.className || null, p.level, p.exp, p.gold,
      p.stats.str, p.stats.int, p.stats.vit, p.stats.agi, p.stats.wil, p.statPoints,
      Math.round(p.x), Math.round(p.y),
      JSON.stringify(p.learned || []),
      JSON.stringify(p.carried || []),
      JSON.stringify(p.codex || []),
      JSON.stringify(p.books || []),
      JSON.stringify(p.inv?.equipped || {}),
      JSON.stringify(p.inv?.bag || []),
      JSON.stringify(p.skillRanks || {}),
      JSON.stringify(p.bookRanks || {}),
      JSON.stringify(p.mastery || {}),
      characterId,
    ]
  );
  return true;
}

module.exports = {
  MAX_CHARACTERS, list, create, rerollBoon, lockBoon, savePosition, saveProgress,
  getOwned, present, validateName,
};
