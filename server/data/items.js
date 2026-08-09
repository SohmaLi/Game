'use strict';

/**
 * Vật phẩm và trang bị.
 *
 * Đồ được sinh theo thủ tục (procedural) chứ không viết tay từng món: mỗi món
 * = một khuôn nền + một hạng + các chỉ số được rải ngẫu nhiên trong một "ngân
 * sách". Viết tay vài trăm món là việc không bao giờ xong, còn cách này cho
 * ra vô số món mà vẫn kiểm soát được sức mạnh.
 *
 * Điểm mấu chốt về cân bằng: **ngân sách chỉ số** quyết định tất cả. Muốn đồ
 * mạnh lên hay yếu đi thì chỉnh một con số, không phải sửa từng món.
 */

/* ---------------------------------------------------------- ô trang bị --- */

const SLOTS = [
  { id: 'weapon', name: 'Vũ khí chính' },
  { id: 'offhand', name: 'Vũ khí phụ / Khiên' },
  { id: 'head', name: 'Mũ' },
  { id: 'chest', name: 'Giáp thân' },
  { id: 'hands', name: 'Găng tay' },
  { id: 'feet', name: 'Giày' },
  { id: 'cape', name: 'Áo choàng' },
  { id: 'amulet', name: 'Dây chuyền' },
  { id: 'ring1', name: 'Nhẫn I' },
  { id: 'ring2', name: 'Nhẫn II' },
];

const SLOT_IDS = SLOTS.map((s) => s.id);

/* ------------------------------------------------------------- hạng ------ */

/**
 * `budget` ở đây nhân vào CHỈ SỐ CHÍNH. `statCount` là tổng số chỉ số trên món;
 * các chỉ số ngoài cái đầu tiên là phần cộng thêm, không lấy bớt của chỉ số chính.
 */
const RARITIES = {
  common: { id: 'common', name: 'Thường', color: '#9aa5ba', budget: 1.00, statCount: 1, passives: 0, weight: 100 },
  fine: { id: 'fine', name: 'Tinh Xảo', color: '#e6e9ef', budget: 1.12, statCount: 2, passives: 0, weight: 45 },
  rare: { id: 'rare', name: 'Hiếm', color: '#5b9cff', budget: 1.28, statCount: 3, passives: 1, weight: 16 },
  epic: { id: 'epic', name: 'Sử Thi', color: '#a97bff', budget: 1.45, statCount: 4, passives: 1, weight: 4.5 },
  legendary: { id: 'legendary', name: 'Truyền Thuyết', color: '#ff9f43', budget: 1.70, statCount: 4, passives: 2, weight: 0.7 },
};

/** Mỗi chỉ số phụ đáng bao nhiêu phần so với chỉ số chính. */
const EXTRA_STAT_SHARE = 0.4;

const RARITY_ORDER = ['common', 'fine', 'rare', 'epic', 'legendary'];

/* -------------------------------------------------------- khuôn nền ------ */

/**
 * Hệ số quy đổi từ "điểm ngân sách" của khuôn nền sang chỉ số thật.
 *
 * Đây là **một con số duy nhất chỉnh sức mạnh của toàn bộ trang bị trong game**.
 * Muốn đồ mạnh lên thì tăng, yếu đi thì giảm — không phải sửa từng khuôn.
 *
 * Chọn 0.28 để cân với nhân vật cấp 1 có 5 điểm mỗi chỉ số:
 *   - Một món Thường cho khoảng +2 đến +4 vào chỉ số chính
 *   - Mặc đủ 10 ô hàng Thường thì tổng chỉ số tăng gần gấp đôi
 *   - Một món Truyền Thuyết mạnh gấp đôi món Thường cùng ô
 *
 * Trước khi có hằng số này, một chiếc Giáp Tấm Thường cấp 1 cho +13 Thể Chất
 * và đẩy máu từ 118 lên 274 — món đồ tầm thường nhất game mạnh hơn cả nhân vật.
 */
const POWER_SCALE = 0.28;

/**
 * `weights` quyết định chỉ số nào hay xuất hiện trên món đó. Giày thiên về
 * Nhanh Nhẹn, giáp thân thiên về Thể Chất — nhờ vậy đồ có "tính cách" mà
 * không cần viết tay.
 */
const BASES = [
  // Vũ khí — ngân sách cao nhất vì đây là ô quyết định sát thương
  { id: 'sword', name: 'Trường Kiếm', slot: 'weapon', budget: 14, weights: { str: 6, agi: 2, vit: 1 } },
  { id: 'axe', name: 'Rìu Chiến', slot: 'weapon', budget: 14, weights: { str: 7, vit: 2 } },
  { id: 'staff', name: 'Trượng Phép', slot: 'weapon', budget: 14, weights: { int: 7, wil: 2 } },
  { id: 'wand', name: 'Đũa Phép', slot: 'weapon', budget: 13, weights: { int: 6, agi: 2, wil: 1 } },

  { id: 'shield', name: 'Khiên Gỗ', slot: 'offhand', budget: 9, weights: { vit: 6, str: 2 } },
  { id: 'tome', name: 'Sách Cổ', slot: 'offhand', budget: 9, weights: { int: 5, wil: 3 } },

  { id: 'helm', name: 'Mũ Sắt', slot: 'head', budget: 8, weights: { vit: 4, wil: 3 } },
  { id: 'hood', name: 'Mũ Trùm', slot: 'head', budget: 8, weights: { int: 4, agi: 3 } },

  { id: 'plate', name: 'Giáp Tấm', slot: 'chest', budget: 12, weights: { vit: 7, str: 2 } },
  { id: 'robe', name: 'Áo Choàng Phép', slot: 'chest', budget: 12, weights: { int: 5, wil: 4 } },

  { id: 'gloves', name: 'Găng Da', slot: 'hands', budget: 7, weights: { str: 3, agi: 3, int: 2 } },
  { id: 'boots', name: 'Giày Da', slot: 'feet', budget: 7, weights: { agi: 6, vit: 2 } },
  { id: 'cloak', name: 'Áo Khoác', slot: 'cape', budget: 7, weights: { wil: 4, agi: 3 } },
  { id: 'amulet', name: 'Bùa Hộ Mệnh', slot: 'amulet', budget: 8, weights: { wil: 4, int: 3, vit: 2 } },
  { id: 'ring', name: 'Nhẫn', slot: 'ring', budget: 6, weights: { str: 2, int: 2, agi: 2, vit: 2, wil: 2 } },
];

const BASE_BY_SLOT = {};
for (const b of BASES) (BASE_BY_SLOT[b.slot] ||= []).push(b);

/* ---------------------------------------------------- bị động trên đồ ---- */

/**
 * Bị động từ trang bị KHÔNG chiếm ô mang theo (DESIGN.md §3.5) — nó đi kèm
 * món đồ. Nếu đồ xịn ăn mất ô kỹ năng thì không ai dám mặc đồ xịn.
 */
const PASSIVES = [
  { id: 'p_crit', name: 'Sắc Bén', desc: '+{v}% tỉ lệ chí mạng', effect: { critChance: 0.03 }, per: 3 },
  { id: 'p_critdmg', name: 'Tàn Nhẫn', desc: '+{v}% sát thương chí mạng', effect: { critDamage: 0.10 }, per: 10 },
  { id: 'p_armor', name: 'Vững Chãi', desc: '+{v}% Giáp', effect: { armorPercent: 0.08 }, per: 8 },
  { id: 'p_resist', name: 'Ma Kháng', desc: '+{v}% Kháng phép', effect: { resistPercent: 0.08 }, per: 8 },
  { id: 'p_hp', name: 'Sinh Lực', desc: '+{v}% Máu tối đa', effect: { hpPercent: 0.07 }, per: 7 },
  { id: 'p_regen', name: 'Hồi Sinh', desc: 'Hồi {v}% máu mỗi vòng', effect: { regenPercent: 0.02 }, per: 2 },
  { id: 'p_manaregen', name: 'Suối Mana', desc: 'Hồi thêm {v} mana mỗi vòng', effect: { manaRegen: 3 }, per: 3 },
  { id: 'p_dodge', name: 'Linh Hoạt', desc: '+{v}% tỉ lệ né', effect: { dodge: 0.04 }, per: 4 },
  { id: 'p_thorns', name: 'Gai Nhọn', desc: 'Dội lại {v}% sát thương nhận vào', effect: { reflect: 0.06 }, per: 6 },
  { id: 'p_lifesteal', name: 'Hút Máu', desc: 'Hồi {v}% sát thương gây ra thành máu', effect: { lifesteal: 0.05 }, per: 5 },
];

/* ------------------------------------------------------------ sinh đồ ---- */

const STAT_KEYS = ['str', 'int', 'vit', 'agi', 'wil'];
const STAT_NAMES = { str: 'Sức Mạnh', int: 'Trí Tuệ', vit: 'Thể Chất', agi: 'Nhanh Nhẹn', wil: 'Ý Chí' };

let nextItemId = 1;

function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.v;
  }
  return entries[entries.length - 1].v;
}

/** Bốc hạng theo trọng số. `luck` nhân vào trọng số của các hạng cao. */
function rollRarity(luck = 1) {
  return pickWeighted(RARITY_ORDER.map((id) => ({
    v: id,
    w: RARITIES[id].weight * (id === 'common' || id === 'fine' ? 1 : luck),
  })));
}

/**
 * Sinh một món đồ.
 * @param level  cấp của món, thường lấy theo cấp quái rơi ra
 * @param opts.rarity  ép hạng cụ thể, để trống thì bốc
 * @param opts.slot    ép ô cụ thể
 */
function generate(level = 1, opts = {}) {
  const rarityId = opts.rarity || rollRarity(opts.luck || 1);
  const rarity = RARITIES[rarityId];

  const pool = opts.slot ? (BASE_BY_SLOT[opts.slot] || BASES) : BASES;
  const base = pool[Math.floor(Math.random() * pool.length)];

  // Ngân sách tăng theo cấp — đồ cấp 10 phải rõ ràng mạnh hơn đồ cấp 1
  const budget = base.budget * POWER_SCALE * rarity.budget * (1 + (level - 1) * 0.12);

  // Chọn chỉ số theo trọng số của khuôn nền, không trùng nhau
  const chosen = [];
  const available = Object.entries(base.weights).map(([k, w]) => ({ v: k, w }));
  const count = Math.min(rarity.statCount, available.length);
  for (let i = 0; i < count; i++) {
    const key = pickWeighted(available);
    chosen.push(key);
    const idx = available.findIndex((e) => e.v === key);
    available.splice(idx, 1);
    if (!available.length) break;
  }

  /**
   * Chỉ số chính KHÔNG bị chia sẻ ngân sách với các chỉ số phụ — nó luôn nhận
   * trọn phần của mình, còn chỉ số phụ là phần CỘNG THÊM.
   *
   * Cách chia ngân sách trước đây (rải đều một cục cho tất cả chỉ số) tạo ra
   * nghịch lý: hạng càng cao càng nhiều chỉ số, nên chỉ số chính càng loãng —
   * một món Hiếm có Thể Chất thấp hơn món Thường cùng ô. Người chơi nhặt được
   * đồ xanh mà yếu hơn đồ xám thì cả hệ thống rớt đồ mất ý nghĩa.
   *
   * Với cách này, hạng cao hơn luôn mạnh hơn ở mọi mặt.
   */
  const stats = {};
  chosen.forEach((key, i) => {
    const share = i === 0 ? budget : budget * EXTRA_STAT_SHARE;
    const value = Math.max(1, Math.round(share * (0.9 + Math.random() * 0.2)));
    stats[key] = (stats[key] || 0) + value;
  });

  // Bị động cho hạng Hiếm trở lên
  const passives = [];
  const passivePool = [...PASSIVES];
  for (let i = 0; i < rarity.passives && passivePool.length; i++) {
    const p = passivePool.splice(Math.floor(Math.random() * passivePool.length), 1)[0];
    passives.push({ id: p.id, name: p.name, desc: p.desc.replace('{v}', p.per), effect: p.effect });
  }

  return {
    uid: `i${nextItemId++}`,
    baseId: base.id,
    name: `${base.name}${rarityId === 'common' ? '' : ` ${rarity.name}`}`,
    slot: base.slot,
    rarity: rarityId,
    rarityName: rarity.name,
    color: rarity.color,
    level,
    stats,
    passives,
  };
}

module.exports = {
  SLOTS, SLOT_IDS, RARITIES, RARITY_ORDER, BASES, PASSIVES, POWER_SCALE,
  STAT_KEYS, STAT_NAMES,
  generate, rollRarity,
  /** Nhẫn dùng chung khuôn 'ring' nhưng lắp được vào cả hai ô nhẫn. */
  fitsSlot: (item, slotId) => (item.slot === 'ring' ? slotId === 'ring1' || slotId === 'ring2' : item.slot === slotId),
};
