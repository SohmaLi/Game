'use strict';

const items = require('./data/items');
const monsterData = require('./data/monsters');
const skills = require('./data/skills');

/**
 * Cơ chế rớt đồ.
 *
 * Hai loại rơi tách biệt nhau, mỗi loại có tỉ lệ riêng:
 *   1. Trang bị — thứ rơi thường xuyên, giữ nhịp chơi
 *   2. Sách Dị Điển — thứ hiếm, quyết định lối chơi lâu dài (DESIGN.md §6.3)
 *
 * Đặc Ân *Duyên Kho Báu* nhân vào cả hai. Đặc quyền quốc gia không ảnh hưởng
 * tỉ lệ rơi, chỉ ảnh hưởng vàng.
 */

/** Xác suất rơi ÍT NHẤT một món trang bị, theo hạng quái. */
const ITEM_DROP_RATE = {
  common: 0.30,
  elite: 0.65,
  boss: 1.00,
};

/** Số món tối đa một con có thể rơi. */
const ITEM_DROP_MAX = {
  common: 1,
  elite: 2,
  boss: 4,
};

/**
 * Tính chiến lợi phẩm cho một trận đã thắng.
 *
 * @param monsterIds  danh sách quái đã hạ
 * @param opts.luck   hệ số Duyên Kho Báu (1 = không có)
 * @param opts.goldBonus  đặc quyền Duskmoor (0.1 = +10%)
 * @param opts.partySize  chia đều phần thưởng cho cả nhóm
 */
function rollBattleLoot(monsterIds, opts = {}) {
  const luck = opts.luck || 1;
  const goldBonus = opts.goldBonus || 0;
  const partySize = Math.max(1, opts.partySize || 1);

  let exp = 0;
  let gold = 0;
  const drops = [];
  const books = [];

  for (const id of monsterIds) {
    const def = monsterData.get(id);
    if (!def) continue;

    exp += def.exp;
    gold += def.gold;

    const tier = monsterData.TIER[def.tier];

    // --- trang bị ---
    if (Math.random() < ITEM_DROP_RATE[def.tier] * luck) {
      const count = 1 + Math.floor(Math.random() * ITEM_DROP_MAX[def.tier]);
      for (let i = 0; i < count; i++) {
        drops.push(items.generate(def.level, { luck }));
      }
    }

    // --- sách Dị Điển ---
    if (Math.random() < tier.bookDropRate * luck) {
      const pool = skills.CODEX_SKILLS;
      const skillId = pool[Math.floor(Math.random() * pool.length)];
      const skill = skills.get(skillId);
      books.push({
        uid: `bk${Date.now()}${Math.floor(Math.random() * 100000)}`,
        from: def.name,
        tier: def.tier,
        skillId,
        name: `Dị Điển: ${skill.name}`,
        desc: skill.desc,
      });
    }
  }

  return {
    exp: Math.max(1, Math.round(exp / partySize)),
    gold: Math.max(0, Math.round((gold * (1 + goldBonus)) / partySize)),
    // Đồ KHÔNG chia đều — mỗi người chơi bốc riêng, nếu không thì nhóm 5 người
    // mỗi người chỉ được 1/5 món đồ, chẳng ai nhận được gì cả
    drops,
    books,
  };
}

module.exports = { rollBattleLoot, ITEM_DROP_RATE, ITEM_DROP_MAX };
