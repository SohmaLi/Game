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
    kind: 'physical', power: 1.0, manaCost: 0, rage: -16, cooldown: 0, target: 'enemy',
    desc: 'Đòn đánh cơ bản. Không tốn mana, tích 16 Nộ Khí.',
  },
  {
    id: 'defend', name: 'Phòng Thủ', class: null,
    kind: 'buff', power: 0, manaCost: 0, rage: -10, cooldown: 0, target: 'self',
    effect: { type: 'damageReduction', percent: 0.45, turns: 1 },
    desc: 'Giảm 45% sát thương nhận vào trong vòng này. Tích 10 Nộ Khí.',
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

  /* -------------------------------- Thủ Lĩnh: đòn quét cả nhóm --------- */
  /**
   * Thủ Lĩnh đứng một mình chống cả nhóm, mỗi vòng chỉ ra tay đúng một lần.
   * Không có đòn quét diện rộng thì năm người xúm vào là nó chết trước khi kịp
   * gây ra thiệt hại đáng kể — cộng thêm bao nhiêu máu cũng chỉ làm trận đấu
   * dài ra chứ không làm nó nguy hiểm hơn.
   */
  {
    id: 'm_quake', name: 'Chấn Địa', class: null, monsterOnly: true,
    kind: 'physical', power: 1.05, manaCost: 0, rage: 0, cooldown: 2, target: 'allEnemies',
    desc: 'Giậm chân làm rung cả mặt đất, quật ngã mọi kẻ đứng quanh.',
  },
  {
    id: 'm_wail', name: 'Tiếng Gào', class: null, monsterOnly: true,
    kind: 'magic', power: 0.95, manaCost: 0, rage: 0, cooldown: 2, target: 'allEnemies',
    effect: { type: 'slow', percent: 0.20, turns: 2 },
    desc: 'Tiếng gào xuyên qua giáp, làm chậm cả nhóm.',
  },

  /* ------------------------------------- Chiến Binh · bậc cao --------- */
  {
    id: 'taunt', name: 'Khiêu Khích', class: 'warrior',
    kind: 'buff', power: 0, manaCost: 0, rage: 15, cooldown: 3, target: 'self',
    effect: { type: 'taunt', turns: 2 },
    effect2: { type: 'damageReduction', percent: 0.20, turns: 2 },
    desc: 'Ép toàn bộ kẻ địch nhắm vào mình trong 2 vòng, đồng thời giảm 20% sát thương nhận vào.',
  },
  {
    id: 'execute', name: 'Kết Liễu', class: 'warrior',
    kind: 'physical', power: 1.5, manaCost: 0, rage: 30, cooldown: 2, target: 'enemy',
    execute: { threshold: 0.35, bonus: 1.4 },
    desc: 'Sát thương tăng mạnh nếu mục tiêu còn dưới 35% máu.',
  },
  {
    id: 'berserk', name: 'Cuồng Chiến', class: 'warrior',
    kind: 'buff', power: 0, manaCost: 0, rage: 50, cooldown: 5, target: 'self',
    effect: { type: 'damageBuff', percent: 0.45, turns: 3 },
    desc: 'Tăng 45% sát thương gây ra trong 3 vòng. Tốn 50 Nộ Khí.',
  },

  /* ------------------------------------- Pháp Sư · bậc cao ------------ */
  {
    id: 'barrier', name: 'Khiên Phép', class: 'mage',
    kind: 'buff', power: 0, manaCost: 16, rage: 0, cooldown: 3, target: 'ally',
    effect: { type: 'damageReduction', percent: 0.40, turns: 2 },
    desc: 'Dựng khiên cho một đồng đội, giảm 40% sát thương trong 2 vòng.',
  },
  {
    id: 'meteor', name: 'Thiên Thạch', class: 'mage',
    kind: 'magic', power: 1.25, manaCost: 26, rage: 0, cooldown: 3, target: 'allEnemies',
    desc: 'Thiên thạch rơi xuống toàn bộ kẻ địch.',
  },
  {
    id: 'arcane_surge', name: 'Bùng Nổ Ma Lực', class: 'mage',
    kind: 'magic', power: 2.6, manaCost: 34, rage: 0, cooldown: 4, target: 'enemy',
    desc: 'Dồn toàn bộ ma lực vào một đòn duy nhất.',
  },

  /* ------------------------------------- Dị Điển (rơi từ quái) -------- */
  {
    id: 'd_venom', name: 'Nọc Độc', class: null, codex: true,
    kind: 'physical', power: 0.9, manaCost: 0, rage: 0, cooldown: 2, target: 'enemy',
    effect: { type: 'dot', amount: 6, turns: 3, maxStacks: 3 },
    desc: 'Học từ nhện hang. Gieo độc cộng dồn lên mục tiêu.',
  },
  {
    id: 'd_howl', name: 'Tiếng Hú', class: null, codex: true,
    kind: 'buff', power: 0, manaCost: 0, rage: 0, cooldown: 4, target: 'allEnemies',
    effect: { type: 'slow', percent: 0.25, turns: 2 },
    desc: 'Học từ sói đầu đàn. Làm chậm toàn bộ kẻ địch.',
  },
  {
    id: 'd_drain', name: 'Hút Sinh Lực', class: null, codex: true,
    kind: 'magic', power: 1.1, manaCost: 8, rage: 0, cooldown: 2, target: 'enemy',
    drain: 0.5,
    desc: 'Học từ oán linh. Hồi máu bằng 50% sát thương gây ra.',
  },
  {
    id: 'd_bonewall', name: 'Tường Xương', class: null, codex: true,
    kind: 'buff', power: 0, manaCost: 6, rage: 0, cooldown: 4, target: 'allAllies',
    effect: { type: 'damageReduction', percent: 0.22, turns: 2 },
    desc: 'Học từ bộ hài cốt. Giảm sát thương cho cả đội.',
  },
  {
    id: 'd_ambush', name: 'Đâm Lén', class: null, codex: true,
    kind: 'physical', power: 1.85, manaCost: 0, rage: 0, cooldown: 3, target: 'enemy',
    desc: 'Học từ cướp đường. Nhát đâm hiểm từ góc khuất.',
  },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/**
 * Đánh Thường và Phòng Thủ là **bẩm sinh** — ai cũng có, không nằm trong cây
 * kỹ năng và không chiếm ô mang theo. Nếu bắt học mới có thì người chơi cấp 1
 * chưa cộng điểm sẽ không làm được gì trong trận đầu tiên.
 */
const INNATE = ['attack', 'defend'];

/** Số kỹ năng học được tối đa mang vào trận (DESIGN.md §3.5). */
const MAX_LOADOUT = 10;

/** Danh sách kỹ năng Dị Điển có thể rơi ra từ sách. */
const CODEX_SKILLS = SKILLS.filter((s) => s.codex).map((s) => s.id);

function get(id) {
  return BY_ID.get(id) || null;
}

/**
 * Bộ kỹ năng mang vào trận = bẩm sinh + những gì người chơi đã chọn mang theo.
 * Lọc lại theo danh sách đã học để không ai mang chiêu chưa mở.
 */
function loadoutFor(className, carried = [], learned = []) {
  const valid = carried.filter((id) => learned.includes(id) && get(id));
  return [...INNATE, ...valid.slice(0, MAX_LOADOUT)];
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

module.exports = { SKILLS, get, loadoutFor, publicView, INNATE, MAX_LOADOUT, CODEX_SKILLS };
