'use strict';

/**
 * Kỹ năng — bản nháp đầu tiên, đủ để chơi thử hệ turn-based.
 *
 * Cây Nền đầy đủ của từng class là Giai đoạn 4; ở đây chỉ có vài chiêu mỗi class
 * để kiểm chứng vòng lượt, chọn mục tiêu và công thức sát thương chạy đúng.
 *
 * Trường:
 *   kind      physical | magic | heal | buff
 *   power     hệ số nhân với chỉ số tấn công
 *   manaCost  mana tiêu hao
 *   rage      Nộ Khí tiêu hao (Chiến Binh) hoặc sinh ra (số âm)
 *   cooldown  số vòng phải chờ trước khi dùng lại
 *   target    enemy | ally | self | allEnemies | allAllies
 */

const SKILLS = [
  /* ---------------------------------------------------- chung ------------ */
  {
    id: 'attack', name: 'Đánh Thường', class: null,
    kind: 'physical', power: 1.0, manaCost: 0, rage: -8, cooldown: 0, target: 'enemy',
    desc: 'Đòn đánh cơ bản. Không tốn mana, tích 8 Nộ Khí.',
  },
  {
    id: 'defend', name: 'Phòng Thủ', class: null,
    kind: 'buff', power: 0, manaCost: 0, rage: -5, cooldown: 0, target: 'self',
    effect: { type: 'damageReduction', percent: 0.45, turns: 1 },
    desc: 'Giảm 45% sát thương nhận vào trong vòng này. Tích 5 Nộ Khí.',
  },

  /* ---------------------------------------------------- Chiến Binh ------- */
  {
    id: 'heavy_slash', name: 'Chém Mạnh', class: 'warrior',
    kind: 'physical', power: 1.75, manaCost: 0, rage: 25, cooldown: 1, target: 'enemy',
    desc: 'Nhát chém dồn lực. Tốn 25 Nộ Khí.',
  },
  {
    id: 'whirlwind', name: 'Xoáy Lốc', class: 'warrior',
    kind: 'physical', power: 0.95, manaCost: 0, rage: 40, cooldown: 2, target: 'allEnemies',
    desc: 'Quét trúng toàn bộ kẻ địch. Tốn 40 Nộ Khí.',
  },
  {
    id: 'iron_skin', name: 'Gồng Mình', class: 'warrior',
    // Tiêu Nộ chứ không tiêu mana: Chiến Binh không có thanh mana, để chiêu
    // của họ đòi mana là bắt người chơi nhìn một thanh mà class mình không dùng
    kind: 'buff', power: 0, manaCost: 0, rage: 20, cooldown: 3, target: 'self',
    effect: { type: 'damageReduction', percent: 0.30, turns: 3 },
    desc: 'Giảm 30% sát thương nhận vào trong 3 vòng. Tốn 20 Nộ Khí.',
  },

  /* ---------------------------------------------------- Pháp Sư ---------- */
  {
    id: 'fireball', name: 'Hỏa Cầu', class: 'mage',
    kind: 'magic', power: 1.7, manaCost: 10, rage: 0, cooldown: 0, target: 'enemy',
    desc: 'Quả cầu lửa nổ vào một mục tiêu.',
  },
  {
    id: 'frost_spear', name: 'Băng Thương', class: 'mage',
    kind: 'magic', power: 1.3, manaCost: 12, rage: 0, cooldown: 2, target: 'enemy',
    effect: { type: 'slow', percent: 0.30, turns: 2 },
    desc: 'Sát thương băng, giảm 30% Nhanh Nhẹn của mục tiêu trong 2 vòng.',
  },
  {
    id: 'mend', name: 'Hồi Phục', class: 'mage',
    kind: 'heal', power: 1.4, manaCost: 14, rage: 0, cooldown: 1, target: 'ally',
    desc: 'Hồi máu cho một đồng đội.',
  },

  /* ---------------------------------------------------- quái vật --------- */
  {
    id: 'm_bite', name: 'Cắn Xé', class: null, monsterOnly: true,
    kind: 'physical', power: 1.5, manaCost: 0, rage: 0, cooldown: 2, target: 'enemy',
    desc: 'Cú cắn sâu vào thịt.',
  },
  {
    id: 'm_ambush', name: 'Đâm Lén', class: null, monsterOnly: true,
    kind: 'physical', power: 1.9, manaCost: 0, rage: 0, cooldown: 3, target: 'enemy',
    desc: 'Nhát đâm hiểm từ góc khuất.',
  },
  {
    id: 'm_curse', name: 'Lời Nguyền', class: null, monsterOnly: true,
    kind: 'magic', power: 1.2, manaCost: 0, rage: 0, cooldown: 3, target: 'enemy',
    effect: { type: 'slow', percent: 0.25, turns: 2 },
    desc: 'Lời nguyền làm chậm mục tiêu.',
  },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** Bộ kỹ năng mặc định khi nhân vật chưa chọn class — đủ để đánh thử. */
const DEFAULT_LOADOUT = ['attack', 'defend'];

const LOADOUT_BY_CLASS = {
  warrior: ['attack', 'defend', 'heavy_slash', 'whirlwind', 'iron_skin'],
  mage: ['attack', 'defend', 'fireball', 'frost_spear', 'mend'],
};

function get(id) {
  return BY_ID.get(id) || null;
}

function loadoutFor(className) {
  return LOADOUT_BY_CLASS[className] || DEFAULT_LOADOUT;
}

/** Bản gửi client — có đủ thông tin để vẽ nút bấm. */
function publicView(id) {
  const s = get(id);
  if (!s) return null;
  return {
    id: s.id, name: s.name, kind: s.kind, desc: s.desc,
    manaCost: s.manaCost, rage: s.rage, cooldown: s.cooldown, target: s.target,
  };
}

module.exports = { SKILLS, get, loadoutFor, publicView, DEFAULT_LOADOUT, LOADOUT_BY_CLASS };
