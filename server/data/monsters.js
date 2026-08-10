'use strict';

/**
 * Quái vật.
 *
 * Ba chủng: thú vật · con người · xác sống (DESIGN.md §6.1).
 * Mọi quái có đánh thường + 1 kỹ năng chủ chốt. Hạng Tinh Anh có 2, Thủ Lĩnh có 3.
 *
 * `tier`   common | elite | boss
 * `family` beast | human | undead   — Vharn chịu ít sát thương hơn từ beast
 * `level`  cấp GỐC của bản mẫu. Ngoài bản đồ, mỗi vùng kéo con quái về khoảng
 *          cấp của mình bằng `scaled()` — cùng một con Sói Xám ở vùng cấp 1-10
 *          và vùng cấp 41-50 là hai đối thủ hoàn toàn khác nhau.
 */

const MONSTERS = [
  /* ------------------------------------------------------- hạng Thường --- */
  {
    id: 'grey_wolf', name: 'Sói Xám', family: 'beast', tier: 'common',
    level: 1, color: '#8b96a8',
    stats: { str: 7, int: 2, vit: 4, agi: 9, wil: 3 },
    skills: ['attack', 'm_bite'],
    exp: 12, gold: 5,
    desc: 'Nhanh, ít máu, hiếm khi đi một mình.',
  },
  {
    id: 'bandit', name: 'Cướp Đường', family: 'human', tier: 'common',
    level: 2, color: '#a8724a',
    stats: { str: 8, int: 4, vit: 6, agi: 7, wil: 4 },
    skills: ['attack', 'm_ambush'],
    exp: 18, gold: 14,
    desc: 'Có trang bị tử tế và biết chọn thời điểm.',
  },
  {
    id: 'skeleton', name: 'Bộ Hài Cốt', family: 'undead', tier: 'common',
    level: 2, color: '#cfd4dd',
    stats: { str: 7, int: 3, vit: 8, agi: 4, wil: 6 },
    skills: ['attack', 'm_curse'],
    exp: 16, gold: 8,
    desc: 'Chậm chạp, dai dẳng, không biết sợ.',
  },
  {
    id: 'mist_spider', name: 'Nhện Sương', family: 'beast', tier: 'common',
    level: 3, color: '#6f8f6a',
    stats: { str: 6, int: 5, vit: 5, agi: 11, wil: 3 },
    skills: ['attack', 'd_venom'],
    exp: 24, gold: 11,
    desc: 'Giăng tơ trong sương, cắn một phát là ngấm độc.',
  },
  {
    id: 'bone_archer', name: 'Xạ Thủ Xương', family: 'undead', tier: 'common',
    level: 4, color: '#b9c3b0',
    stats: { str: 9, int: 4, vit: 6, agi: 9, wil: 5 },
    skills: ['attack', 'm_ambush'],
    exp: 30, gold: 15,
    desc: 'Bắn từ xa, nhắm vào người yếu nhất trong nhóm.',
  },
  {
    id: 'frost_revenant', name: 'Oán Hồn Băng', family: 'undead', tier: 'common',
    level: 5, color: '#8fc7e8',
    stats: { str: 8, int: 9, vit: 8, agi: 6, wil: 9 },
    skills: ['attack', 'd_drain'],
    exp: 38, gold: 19,
    desc: 'Hút hơi ấm của kẻ sống để giữ mình khỏi tan.',
  },
  {
    id: 'storm_cultist', name: 'Tín Đồ Bão', family: 'human', tier: 'common',
    level: 6, color: '#9a7ad8',
    stats: { str: 8, int: 12, vit: 7, agi: 8, wil: 10 },
    skills: ['attack', 'm_curse'],
    exp: 46, gold: 26,
    desc: 'Gọi sấm xuống đầu kẻ dám bước lên đỉnh núi.',
  },

  /* ------------------------------------------------------ hạng Tinh Anh -- */
  {
    id: 'cliff_bear', name: 'Gấu Vách Đá', family: 'beast', tier: 'elite',
    level: 3, color: '#7a5c3e',
    stats: { str: 12, int: 2, vit: 11, agi: 4, wil: 5 },
    skills: ['attack', 'm_bite', 'm_ambush'],
    exp: 40, gold: 18,
    desc: 'Chậm nhưng mỗi cú tát đều đáng sợ.',
  },

  /* ------------------------------------------------------ hạng Thủ Lĩnh -- */
  /**
   * Chỉ số Thủ Lĩnh đặt ở CẤP GỐC THẤP, xấp xỉ 1,8 lần con quái thường cùng cấp
   * gốc, rồi để `scaled()` kéo lên theo vùng.
   *
   * Trước đây mỗi Thủ Lĩnh có một bảng chỉ số viết tay ở cấp cao. Sai lầm: sức
   * mạnh người chơi tăng theo cấp nhanh hơn hẳn mấy con số viết tay đó, nên
   * Thủ Lĩnh vùng cấp 50 lại yếu tương đối hơn Thủ Lĩnh vùng cấp 10. Cùng một
   * công thức tăng với quái thường thì độ khó mới giữ được qua cả 5 vùng.
   */
  {
    id: 'alpha_wolf', name: 'Sói Đầu Đàn', family: 'beast', tier: 'boss',
    level: 1, color: '#d8dee9',
    stats: { str: 13, int: 4, vit: 7, agi: 16, wil: 5 },
    skills: ['attack', 'm_bite', 'm_quake'],
    exp: 230, gold: 140,
    desc: 'Con đầu đàn không gầm — nó chỉ nhìn, rồi cả bầy xông vào.',
  },
  {
    id: 'spider_matron', name: 'Nhện Mẫu', family: 'beast', tier: 'boss',
    level: 3, color: '#4f7a4a',
    stats: { str: 11, int: 9, vit: 9, agi: 20, wil: 5 },
    skills: ['attack', 'd_venom', 'm_wail'],
    exp: 430, gold: 270,
    desc: 'Cả cánh rừng sương là cái tổ của nó.',
  },
  {
    id: 'bone_general', name: 'Tướng Xương', family: 'undead', tier: 'boss',
    level: 2, color: '#e4e9ef',
    stats: { str: 13, int: 5, vit: 14, agi: 7, wil: 11 },
    skills: ['attack', 'm_quake', 'd_bonewall'],
    exp: 300, gold: 200,
    desc: 'Chết đã ba trăm năm mà vẫn giữ đội hình.',
  },
  {
    id: 'ice_troll', name: 'Quỷ Băng', family: 'beast', tier: 'boss',
    level: 5, color: '#7fb2d9',
    stats: { str: 15, int: 12, vit: 15, agi: 11, wil: 16 },
    skills: ['attack', 'm_quake', 'm_bite'],
    exp: 690, gold: 450,
    desc: 'Vết thương trên da nó đóng băng lại trước khi kịp chảy máu.',
  },
  {
    id: 'storm_herald', name: 'Sứ Giả Bão', family: 'human', tier: 'boss',
    level: 6, color: '#b48cff',
    stats: { str: 14, int: 22, vit: 13, agi: 14, wil: 18 },
    skills: ['attack', 'm_wail', 'm_curse'],
    exp: 850, gold: 580,
    desc: 'Đứng giữa mắt bão và nói chuyện với sấm.',
  },
];

const BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

/**
 * `damageMult` nhân thêm vào `MONSTER.damageMult` (0.5).
 *
 * Quái thường đánh nhẹ vì chúng đi theo bầy — bị đông hơn trong hệ turn-based
 * đã là bất lợi lũy tiến rồi. Thủ Lĩnh thì ngược lại: nó ĐỨNG MỘT MÌNH chống cả
 * nhóm, mỗi vòng chỉ ra tay đúng một lần. Bắt nó chịu chung mức phạt đó thì
 * năm người chơi hạ nó trong hai vòng mà không mất giọt máu nào.
 */
const TIER = {
  common: { label: 'Thường', bookDropRate: 0.05, hpMult: 1.0, damageMult: 1.0 },
  elite: { label: 'Tinh Anh', bookDropRate: 0.15, hpMult: 2.2, damageMult: 1.5 },
  boss: { label: 'Thủ Lĩnh', bookDropRate: 0.40, hpMult: 16.0, damageMult: 2.2 },
};

/**
 * Chỉ số quái tăng bao nhiêu cho mỗi cấp vượt trên cấp gốc của bản mẫu.
 *
 * Đây là NÚM CÂN BẰNG DUY NHẤT cho độ khó theo vùng. Người chơi mỗi cấp vừa
 * được 3 điểm chỉ số vừa thay trang bị tốt hơn, nên quái phải tăng nhanh hơn
 * mức 3 điểm đó khá nhiều. 0.22 đo ra được: một người đủ trang bị đánh 2 con
 * cùng cấp thì thắng ~90% và còn khoảng nửa máu, ở cả 5 vùng.
 * Chỉnh xong phải đo lại bằng tools/simulate.js.
 */
const GROWTH_PER_LEVEL = 0.22;

/** Cấp càng cao thì đánh một con càng đáng giá — nếu không, không ai lên vùng mới. */
const REWARD_PER_LEVEL = 0.55;

/**
 * Kéo một bản mẫu về đúng cấp của vùng.
 *
 * Trả về một bản SAO — không bao giờ sửa vào MONSTERS, vì cùng một bản mẫu được
 * dùng lại ở nhiều vùng cùng lúc.
 */
function scaled(def, level) {
  if (!def) return null;
  const lv = Math.max(1, Math.round(level || def.level));
  const k = 1 + (lv - def.level) * GROWTH_PER_LEVEL;
  const r = 1 + (lv - def.level) * REWARD_PER_LEVEL;
  if (k === 1 && r === 1) return def;

  const grow = (v) => Math.max(1, Math.round(v * k));
  return {
    ...def,
    level: lv,
    stats: {
      str: grow(def.stats.str), int: grow(def.stats.int), vit: grow(def.stats.vit),
      agi: grow(def.stats.agi), wil: grow(def.stats.wil),
    },
    exp: Math.max(1, Math.round(def.exp * r)),
    gold: Math.max(0, Math.round(def.gold * r)),
  };
}

function get(id) {
  return BY_ID.get(id) || null;
}

/** Chọn ngẫu nhiên quái hạng Thường — dùng cho trình mô phỏng cân bằng. */
function randomCommon() {
  const pool = MONSTERS.filter((m) => m.tier === 'common');
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Chọn ngẫu nhiên một bản mẫu trong danh sách id của một vùng. */
function randomFrom(ids, tier = null) {
  const pool = (ids || []).map(get).filter((m) => m && (!tier || m.tier === tier));
  if (!pool.length) return randomCommon();
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  MONSTERS, TIER, GROWTH_PER_LEVEL, REWARD_PER_LEVEL,
  get, scaled, randomCommon, randomFrom, all: () => MONSTERS,
};
