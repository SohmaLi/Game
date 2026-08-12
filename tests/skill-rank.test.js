'use strict';

/**
 * Bậc kỹ năng — nơi tiêu điểm dư sau khi Cây Nền đã mở hết.
 *
 * Mỗi lớp chỉ tốn tối đa 15 điểm trong khi người chơi vẫn nhận 1 điểm mỗi cấp
 * tới tận cấp 60 (DESIGN.md), nên từ khoảng cấp 16 trở đi điểm chỉ nằm không.
 * Ảnh chụp thực tế: nhân vật "Link" cấp 21, mở hết 9 nút Cây Nền (15 điểm),
 * còn dư 6 điểm không tiêu vào đâu được.
 */

const test = require('node:test');
const assert = require('node:assert');

const tree = require('../server/data/skilltree');
const statsLib = require('../server/stats');
const Room = require('../server/room');
const zones = require('../server/data/zones');

test('bậc 1 không đổi gì — scaledSkill trả về đúng thông số gốc', () => {
  const base = tree.scaledSkill('fireball', {});
  assert.equal(base.power, 1.7);
});

test('mỗi bậc trên bậc 1 cộng thêm 10% power', () => {
  const r5 = tree.scaledSkill('fireball', { fireball: 5 });
  assert.equal(Math.round(r5.power * 1000), Math.round(1.7 * 1.4 * 1000));
});

test('buff cũng co giãn theo bậc, không chỉ đòn gây sát thương', () => {
  const r1 = tree.scaledSkill('iron_skin', {});
  const r5 = tree.scaledSkill('iron_skin', { iron_skin: 5 });
  assert.equal(r1.effect.percent, 0.30);
  assert.ok(r5.effect.percent > r1.effect.percent, 'Gồng Mình bậc 5 phải giảm sát thương nhiều hơn bậc 1');
});

test('Đánh Thường và Phòng Thủ (bẩm sinh) không nằm trong danh sách mở được để nâng bậc', () => {
  // rankable() chỉ xét HÌNH DẠNG dữ liệu (có power/effect.percent hay không) —
  // "attack" có power nên vẫn true. Thứ thật sự chặn nâng bậc chiêu bẩm sinh
  // là server/net.js#skill:rank đòi skillId phải nằm trong unlockedSkills(),
  // mà danh sách đó chưa bao giờ chứa INNATE (xem data/skills.js).
  const unlocked = tree.unlockedSkills('warrior', ['heavy_slash'], []);
  assert.ok(!unlocked.includes('attack') && !unlocked.includes('defend'));
});

test('điểm dồn vào bậc bị trừ khỏi điểm kỹ năng còn lại', () => {
  const left0 = tree.pointsLeft('warrior', 20, [], {});
  const left1 = tree.pointsLeft('warrior', 20, [], { heavy_slash: 3 });
  assert.equal(left0 - left1, 2, 'bậc 3 tốn 2 điểm (bậc 2 rồi bậc 3) — bậc 1 lúc mở là miễn phí');
});

test('bậc tối đa là 5, không nâng quá', () => {
  assert.equal(tree.MAX_SKILL_RANK, 5);
  assert.equal(tree.rankOf('fireball', { fireball: 99 }), 99, 'server/net.js mới là nơi chặn vượt trần, không phải hàm đọc bậc');
});

test('bậc kỹ năng làm sát thương thật sự tăng qua stats.computeDamage', () => {
  const attacker = { combat: { atkMagic: 100, critChance: 0, critDamage: 1.5 }, isPlayer: true, effects: [] };
  const defender = { combat: { armor: 0, resist: 0, dodge: 0 }, level: 1, hp: 999, hpMax: 999 };

  const origRandom = Math.random;
  Math.random = () => 0.5; // khử crit/dodge/dao động ngẫu nhiên để so sánh công bằng
  try {
    const dmgBase = statsLib.computeDamage(attacker, defender, tree.scaledSkill('fireball', {})).amount;
    const dmgRanked = statsLib.computeDamage(attacker, defender, tree.scaledSkill('fireball', { fireball: 5 })).amount;
    assert.ok(dmgRanked > dmgBase, `bậc 5 phải gây sát thương cao hơn bậc 1 (${dmgRanked} so với ${dmgBase})`);
  } finally {
    Math.random = origRandom;
  }
});

/* -------------------------------------------------- tích hợp qua Room ---- */

function makeRoom() {
  const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };
  return new Room('pve', io, zones.get('meadow'));
}

function character(over = {}) {
  return {
    id: 6, name: 'Link', class: 'warrior', level: 21, exp: 0, gold: 0,
    stats: { str: 8, int: 5, vit: 8, agi: 6, wil: 5, points: 0 },
    learned: ['heavy_slash', 'w_tough', 'iron_skin', 'whirlwind', 'taunt', 'w_rageflow', 'execute', 'w_bulwark', 'berserk'],
    carried: [], codex: null, books: [], equipped: null, bag: [], pos: { x: 0, y: 0 },
    nation: null, boon: null, skillRanks: {},
    ...over,
  };
}

const join = (room, char) => {
  const p = room.add({ id: 's1', join() {} }, 'Link', char);
  room.stopLoop();
  return p;
};

test('nhân vật đã mở hết Cây Nền còn dư điểm để nâng bậc (ảnh chụp thực tế: cấp 21 dư 6đ)', () => {
  const room = makeRoom();
  const p = join(room, character());
  const state = room.characterState(p);
  assert.equal(state.skillPoints, 6, 'cấp 21 nhận 21 điểm, Cây Nền tốn 15 — dư đúng 6 như ảnh chụp người dùng gửi');
});

test('nâng bậc một kỹ năng đã học thì characterState phản ánh đúng bậc mới', () => {
  const room = makeRoom();
  const p = join(room, character({ skillRanks: { heavy_slash: 3 } }));
  const state = room.characterState(p);
  const node = state.tree.find((n) => n.id === 'heavy_slash');
  assert.equal(node.rank, 3);
  assert.equal(node.maxRank, 5);
  assert.equal(state.skillPoints, 6 - 2, 'bậc 3 tốn thêm 2 điểm ngoài 15 điểm của Cây Nền');
});

test('sách Dị Điển đang gắn mang theo thông số kỹ năng thật để xem chi tiết được', () => {
  const room = makeRoom();
  const codex = Array(10).fill(null);
  codex[0] = { uid: 'bk1', skillId: 'd_venom', name: 'Dị Điển: Nọc Độc', from: 'Nhện', desc: 'test' };
  const p = join(room, character({ codex, skillRanks: { d_venom: 2 } }));
  const state = room.characterState(p);
  assert.equal(state.codex[0].kind, 'physical', 'thiếu trường này thì cửa sổ chi tiết không hiện được Loại/Mục tiêu/Hồi chiêu');
  assert.equal(state.codex[0].cooldown, 2);
  assert.equal(state.codex[0].rank, 2);
});

test('sách CHƯA gắn không mang trường rank — tránh hiện nhầm nút nâng bậc bằng điểm', () => {
  const room = makeRoom();
  const p = join(room, character({ books: [{ uid: 'bk2', skillId: 'd_howl', name: 'Dị Điển: Tiếng Hú', from: 'Sói', desc: '' }] }));
  const state = room.characterState(p);
  assert.equal(state.books[0].rank, undefined,
    'sách còn nằm trong túi chưa gắn ô nào — bấm nút "nâng bậc bằng điểm" lúc đó sẽ bị server từ chối vì kỹ năng chưa mở');
});
