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
 * @param killed  danh sách quái đã hạ: `{ id, level }` hoặc chuỗi id.
 *                Cấp là cấp THẬT trong vùng, không phải cấp gốc của bản mẫu —
 *                cùng con Sói Xám ở vùng 41-50 rơi đồ cấp 50.
 * @param opts.luck   hệ số Duyên Kho Báu (1 = không có)
 * @param opts.goldBonus  đặc quyền Duskmoor (0.1 = +10%)
 * @param opts.partySize  chia đều phần thưởng cho cả nhóm
 * @param opts.playerLevel  CẤP của người nhận — quyết định cấp món đồ rơi ra
 * @param opts.quality  hệ số phẩm chất của vùng (`zones.qualityOf`)
 */
function rollBattleLoot(killed, opts = {}) {
  const luck = opts.luck || 1;
  const quality = opts.quality || 1;
  const goldBonus = opts.goldBonus || 0;
  const partySize = Math.max(1, opts.partySize || 1);

  let exp = 0;
  let gold = 0;
  const drops = [];
  const books = [];

  for (const entry of killed) {
    const base = monsterData.get(typeof entry === 'string' ? entry : entry.id);
    if (!base) continue;
    const def = monsterData.scaled(base, entry.level || base.level);

    exp += def.exp;
    gold += def.gold;

    const tier = monsterData.TIER[def.tier];

    /**
     * --- trang bị ---
     *
     * CẤP món đồ bám theo cấp NGƯỜI NHẬN, không theo con quái. Trước đây bám
     * theo quái, nên một người cấp 60 đi ngang Đồng Cỏ chỉ nhặt được đồ cấp 5:
     * rác tuyệt đối, nhặt lên chỉ để vứt, và cả vùng đó thành chỗ chết.
     *
     * HẠNG thì ngược lại — bám theo vùng qua `quality`. Vùng dễ vẫn cho đồ mặc
     * được, chỉ là gần như không bao giờ lên hạng cao. Muốn Sử Thi với Truyền
     * Thuyết thì phải đi vào chỗ khó, chứ không phải đứng chỗ an toàn cày lâu.
     */
    if (Math.random() < ITEM_DROP_RATE[def.tier] * luck) {
      const count = 1 + Math.floor(Math.random() * ITEM_DROP_MAX[def.tier]);
      const level = Math.max(1, opts.playerLevel || def.level);
      for (let i = 0; i < count; i++) {
        drops.push(items.generate(level, { luck, quality }));
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
