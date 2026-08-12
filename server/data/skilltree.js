'use strict';

const skills = require('./skills');

/**
 * CÂY NỀN — cây kỹ năng của class (DESIGN.md §3.3).
 *
 * Mỗi nút là một kỹ năng chủ động hoặc một bị động. Mở nút tốn **điểm kỹ năng**
 * (1 điểm mỗi cấp) và đòi đủ cấp độ, có nút còn đòi phải mở nút trước đó.
 *
 * Thiết kế theo tầng, mỗi tầng hai nhánh:
 *
 *        ┌── nhánh TẤN CÔNG ──┐        ┌── nhánh PHÒNG THỦ ──┐
 *   T1   Chiêu mở màn                   Bị động nền
 *   T2   Chiêu diện rộng                Chiêu tự vệ
 *   T3   Bị động tăng lực               Chiêu khống chế
 *   T4   Chiêu kết liễu                 Bị động sinh tồn
 *   T5              └── chiêu tối thượng ──┘
 *
 * Hai nhánh cố ý **không loại trừ nhau**: người chơi đủ điểm vẫn mở được cả
 * hai, chỉ là chậm hơn. Cây mà ép chọn một nhánh sẽ khiến người chơi tra cứu
 * "build chuẩn" trên mạng rồi làm theo, thay vì tự thử.
 *
 * `pos` là toạ độ lưới để client vẽ, không ảnh hưởng logic.
 */

const NODES = {
  /* ==================================================== CHIẾN BINH ==== */
  warrior: [
    {
      id: 'heavy_slash', name: 'Chém Mạnh', type: 'active', skillId: 'heavy_slash',
      level: 1, cost: 1, requires: [], pos: { x: 0, y: 0 },
    },
    {
      id: 'w_tough', name: 'Da Thịt Chai Sạn', type: 'passive',
      level: 1, cost: 1, requires: [], pos: { x: 1, y: 0 },
      bonus: { combat: { hpPercent: 0.08 } },
      desc: '+8% Máu tối đa.',
    },
    {
      id: 'whirlwind', name: 'Xoáy Lốc', type: 'active', skillId: 'whirlwind',
      level: 4, cost: 1, requires: ['heavy_slash'], pos: { x: 0, y: 1 },
    },
    {
      id: 'iron_skin', name: 'Gồng Mình', type: 'active', skillId: 'iron_skin',
      level: 4, cost: 1, requires: ['w_tough'], pos: { x: 1, y: 1 },
    },
    {
      id: 'w_rageflow', name: 'Cuồng Huyết', type: 'passive',
      level: 8, cost: 2, requires: ['whirlwind'], pos: { x: 0, y: 2 },
      bonus: { resource: { ragePerRound: 4 } },
      desc: '+4 Nộ Khí mỗi vòng — đủ để bù phần tự tan.',
    },
    {
      id: 'taunt', name: 'Khiêu Khích', type: 'active', skillId: 'taunt',
      level: 8, cost: 2, requires: ['iron_skin'], pos: { x: 1, y: 2 },
    },
    {
      id: 'execute', name: 'Kết Liễu', type: 'active', skillId: 'execute',
      level: 12, cost: 2, requires: ['w_rageflow'], pos: { x: 0, y: 3 },
    },
    {
      id: 'w_bulwark', name: 'Thành Lũy', type: 'passive',
      level: 12, cost: 2, requires: ['taunt'], pos: { x: 1, y: 3 },
      bonus: { combat: { armorPercent: 0.15 } },
      desc: '+15% Giáp.',
    },
    {
      id: 'berserk', name: 'Cuồng Chiến', type: 'active', skillId: 'berserk',
      level: 16, cost: 3, requires: ['execute', 'w_bulwark'], pos: { x: 0.5, y: 4 },
      capstone: true,
    },
  ],

  /* ====================================================== PHÁP SƯ ===== */
  mage: [
    {
      id: 'fireball', name: 'Hỏa Cầu', type: 'active', skillId: 'fireball',
      level: 1, cost: 1, requires: [], pos: { x: 0, y: 0 },
    },
    {
      id: 'm_focus', name: 'Tinh Thần Tập Trung', type: 'passive',
      level: 1, cost: 1, requires: [], pos: { x: 1, y: 0 },
      bonus: { combat: { manaPercent: 0.15 } },
      desc: '+15% Mana tối đa.',
    },
    {
      id: 'frost_spear', name: 'Băng Thương', type: 'active', skillId: 'frost_spear',
      level: 4, cost: 1, requires: ['fireball'], pos: { x: 0, y: 1 },
    },
    {
      id: 'mend', name: 'Hồi Phục', type: 'active', skillId: 'mend',
      level: 4, cost: 1, requires: ['m_focus'], pos: { x: 1, y: 1 },
    },
    {
      id: 'm_arcane', name: 'Thấu Hiểu Ma Thuật', type: 'passive',
      level: 8, cost: 2, requires: ['frost_spear'], pos: { x: 0, y: 2 },
      bonus: { combat: { magicPercent: 0.12 } },
      desc: '+12% Sát thương phép.',
    },
    {
      id: 'barrier', name: 'Khiên Phép', type: 'active', skillId: 'barrier',
      level: 8, cost: 2, requires: ['mend'], pos: { x: 1, y: 2 },
    },
    {
      id: 'meteor', name: 'Thiên Thạch', type: 'active', skillId: 'meteor',
      level: 12, cost: 2, requires: ['m_arcane'], pos: { x: 0, y: 3 },
    },
    {
      id: 'm_wellspring', name: 'Suối Nguồn Vô Tận', type: 'passive',
      level: 12, cost: 2, requires: ['barrier'], pos: { x: 1, y: 3 },
      bonus: { resource: { manaPerRound: 5 } },
      desc: '+5 Mana hồi mỗi vòng.',
    },
    {
      id: 'arcane_surge', name: 'Bùng Nổ Ma Lực', type: 'active', skillId: 'arcane_surge',
      level: 16, cost: 3, requires: ['meteor', 'm_wellspring'], pos: { x: 0.5, y: 4 },
      capstone: true,
    },
  ],
};

/** 1 điểm kỹ năng mỗi cấp. */
const POINTS_PER_LEVEL = 1;

/** Số ô Dị Điển (DESIGN.md §3.3). */
const CODEX_SLOTS = 10;

/**
 * Bậc kỹ năng — nơi tiêu điểm dư sau khi Cây Nền đã mở hết.
 *
 * Cây chỉ tốn tối đa 15 điểm mà người chơi vẫn nhận 1 điểm mỗi cấp tới tận cấp
 * 60, nên từ khoảng cấp 16 trở đi điểm chỉ nằm không nhìn rất phí. Mỗi kỹ năng
 * CHỦ ĐỘNG đã mở (Cây Nền hoặc Dị Điển đã gắn) nâng được tối đa 5 bậc, mỗi bậc
 * tốn 1 điểm và cộng thêm 10% sức mạnh (power / effect.percent) so với bậc 1 —
 * không đụng vào hồi chiêu hay tiêu hao, chỉ để đòn ra tay mạnh hơn.
 */
const MAX_SKILL_RANK = 5;
const RANK_POWER_STEP = 0.10;

function treeFor(classId) {
  return NODES[classId] || [];
}

function node(classId, nodeId) {
  return treeFor(classId).find((n) => n.id === nodeId) || null;
}

/** Tổng điểm kỹ năng nhận được tới cấp hiện tại. */
function pointsEarned(level) {
  return Math.max(0, (level - 1) * POINTS_PER_LEVEL + POINTS_PER_LEVEL);
}

function pointsSpent(classId, learned = []) {
  return learned.reduce((sum, id) => sum + (node(classId, id)?.cost || 0), 0);
}

/** Điểm đã dồn vào nâng bậc — bậc 1 là mặc định lúc mở, chỉ bậc 2 trở lên mới tốn điểm. */
function rankPointsSpent(skillRanks = {}) {
  return Object.values(skillRanks || {}).reduce((sum, r) => sum + Math.max(0, (r || 1) - 1), 0);
}

function pointsLeft(classId, level, learned = [], skillRanks = {}) {
  return pointsEarned(level) - pointsSpent(classId, learned) - rankPointsSpent(skillRanks);
}

/** Bậc hiện tại của một kỹ năng — 1 nếu chưa nâng bậc nào. */
function rankOf(skillId, skillRanks = {}) {
  return (skillRanks || {})[skillId] || 1;
}

/** Hệ số nhân sức mạnh theo bậc. Bậc 1 = hệ số gốc, không đổi gì. */
function rankMultiplier(rank) {
  return 1 + RANK_POWER_STEP * Math.max(0, (rank || 1) - 1);
}

/** Kỹ năng này có "thông số" nào để nâng bậc hay không. */
function rankable(skillId) {
  const s = skills.get(skillId);
  if (!s) return false;
  return !!s.power || s.effect?.percent != null || s.effect2?.percent != null || !!s.drain;
}

/**
 * Bản kỹ năng đã co giãn theo bậc — power, effect.percent, drain nhân theo
 * `rankMultiplier`. Bậc 1 hoặc kỹ năng không nâng được thì trả về nguyên bản,
 * không tạo bản sao vô ích.
 */
function scaledSkill(skillId, skillRanks = {}) {
  const base = skills.get(skillId);
  if (!base) return null;
  const rank = rankOf(skillId, skillRanks);
  if (rank <= 1) return base;

  const mult = rankMultiplier(rank);
  const out = { ...base };
  if (out.power) out.power = out.power * mult;
  if (out.effect?.percent != null) out.effect = { ...out.effect, percent: out.effect.percent * mult };
  if (out.effect2?.percent != null) out.effect2 = { ...out.effect2, percent: out.effect2.percent * mult };
  if (out.drain) out.drain = out.drain * mult;
  return out;
}

/** Vì sao một nút chưa mở được — trả về null nếu mở được. */
function blockedReason(classId, nodeId, char) {
  const n = node(classId, nodeId);
  if (!n) return 'Không tìm thấy kỹ năng.';
  if ((char.learned || []).includes(nodeId)) return 'Đã học rồi.';
  if (char.level < n.level) return `Cần đạt cấp ${n.level}.`;

  const missing = n.requires.filter((r) => !(char.learned || []).includes(r));
  if (missing.length) {
    const names = missing.map((r) => node(classId, r)?.name || r).join(', ');
    return `Phải học trước: ${names}.`;
  }
  const left = pointsLeft(classId, char.level, char.learned, char.skillRanks);
  if (left < n.cost) {
    return `Cần ${n.cost} điểm kỹ năng, còn ${left}.`;
  }
  return null;
}

/**
 * Gộp mọi bị động đã học thành bảng cộng thêm, cùng định dạng với trang bị
 * để `stats.derive` chỉ cần biết một kiểu dữ liệu.
 */
function bonuses(classId, learned = []) {
  const combat = {
    hpPercent: 0, manaPercent: 0, armorPercent: 0, resistPercent: 0,
    magicPercent: 0, physicalPercent: 0, critChance: 0, critDamage: 0, dodge: 0,
  };
  const resource = { ragePerRound: 0, manaPerRound: 0, karmaPerRound: 0 };

  for (const id of learned) {
    const n = node(classId, id);
    if (!n?.bonus) continue;
    for (const [k, v] of Object.entries(n.bonus.combat || {})) combat[k] = (combat[k] || 0) + v;
    for (const [k, v] of Object.entries(n.bonus.resource || {})) resource[k] = (resource[k] || 0) + v;
  }
  return { combat, resource };
}

/** Những kỹ năng chủ động đã mở — đây là nguồn để chọn mang vào trận. */
function unlockedSkills(classId, learned = [], codex = []) {
  const fromTree = learned
    .map((id) => node(classId, id))
    .filter((n) => n?.type === 'active' && n.skillId)
    .map((n) => n.skillId);

  // Sách Dị Điển đã gắn cũng cho kỹ năng dùng được
  const fromCodex = codex.filter(Boolean).map((b) => b.skillId).filter(Boolean);

  return [...new Set([...fromTree, ...fromCodex])];
}

/** Bản gửi client để vẽ cây. */
function publicTree(classId, char) {
  return treeFor(classId).map((n) => {
    const learned = (char.learned || []).includes(n.id);
    const skill = n.skillId ? skills.publicView(n.skillId) : null;
    const canRank = learned && n.skillId && rankable(n.skillId);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      level: n.level,
      cost: n.cost,
      requires: n.requires,
      pos: n.pos,
      capstone: !!n.capstone,
      desc: n.desc || skill?.desc || '',
      skill,
      learned,
      blocked: learned ? null : blockedReason(classId, n.id, char),
      rank: canRank ? rankOf(n.skillId, char.skillRanks) : null,
      maxRank: canRank ? MAX_SKILL_RANK : null,
    };
  });
}

module.exports = {
  NODES, POINTS_PER_LEVEL, CODEX_SLOTS, MAX_SKILL_RANK,
  treeFor, node, pointsEarned, pointsSpent, pointsLeft,
  blockedReason, bonuses, unlockedSkills, publicTree,
  rankOf, rankMultiplier, rankPointsSpent, rankable, scaledSkill,
};
