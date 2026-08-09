'use strict';

/**
 * Quái vật — bản nháp Giai đoạn 3.
 *
 * Ba chủng: thú vật · con người · xác sống (DESIGN.md §6.1).
 * Mọi quái có đánh thường + 1 kỹ năng chủ chốt. Hạng Tinh Anh có 2, Thủ Lĩnh có 3.
 *
 * `tier`   common | elite | boss
 * `family` beast | human | undead   — Vharn chịu ít sát thương hơn từ beast
 */

const MONSTERS = [
  {
    id: 'grey_wolf', name: 'Sói Xám', family: 'beast', tier: 'common',
    level: 1, color: '#8b96a8',
    stats: { str: 7, int: 2, vit: 4, agi: 9, wil: 3 },
    skills: ['attack', 'm_bite'],
    exp: 12, gold: 5,
    desc: 'Nhanh, ít máu, hiếm khi đi một mình.',
  },
  {
    id: 'cliff_bear', name: 'Gấu Vách Đá', family: 'beast', tier: 'elite',
    level: 3, color: '#7a5c3e',
    stats: { str: 12, int: 2, vit: 11, agi: 4, wil: 5 },
    skills: ['attack', 'm_bite', 'm_ambush'],
    exp: 40, gold: 18,
    desc: 'Chậm nhưng mỗi cú tát đều đáng sợ.',
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
];

const BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

const TIER = {
  common: { label: 'Thường', bookDropRate: 0.05, hpMult: 1.0 },
  elite: { label: 'Tinh Anh', bookDropRate: 0.15, hpMult: 1.8 },
  boss: { label: 'Thủ Lĩnh', bookDropRate: 0.40, hpMult: 4.0 },
};

function get(id) {
  return BY_ID.get(id) || null;
}

/** Chọn ngẫu nhiên quái hạng Thường để sinh ra ngoài bản đồ. */
function randomCommon() {
  const pool = MONSTERS.filter((m) => m.tier === 'common');
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { MONSTERS, TIER, get, randomCommon, all: () => MONSTERS };
