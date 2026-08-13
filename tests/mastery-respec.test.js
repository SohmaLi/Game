'use strict';

/**
 * Tinh Thông (chỗ tiêu điểm kỹ năng dư) và rửa điểm.
 *
 * Người chơi báo lại: cấp 60, mở hết Cây Nền, nâng kịch bậc mọi chiêu — vẫn dư
 * 21 điểm không tiêu vào đâu được. Và cả hai loại điểm đều tiêu là mất, nên một
 * lần dồn sai là bỏ nhân vật làm lại từ cấp 1.
 */

const test = require('node:test');
const assert = require('node:assert');

const tree = require('../server/data/skilltree');
const respec = require('../server/respec');
const progression = require('../server/progression');

const FULL_TREE = ['heavy_slash', 'w_tough', 'iron_skin', 'whirlwind', 'taunt',
  'w_rageflow', 'execute', 'w_bulwark', 'berserk'];
const FULL_RANKS = { heavy_slash: 5, whirlwind: 5, iron_skin: 5, taunt: 5, execute: 5, berserk: 5 };

/* ------------------------------------------------ điểm dư ------------- */

test('đúng con số người chơi báo: cấp 60 mở hết cây, kịch bậc hết, vẫn dư 21 điểm', () => {
  const left = tree.pointsLeft('warrior', 60, FULL_TREE, FULL_RANKS, {}, {});
  assert.equal(left, 21, 'Cây Nền 15 + nâng bậc 24 = 39, mà cấp 60 nhận 60');
});

test('Tinh Thông chứa hết được số điểm dư đó, và còn thừa chỗ để phải chọn', () => {
  assert.ok(tree.MASTERY_CAPACITY > 21, 'chứa không hết thì vẫn còn điểm nằm không');
  assert.ok(tree.MASTERY_CAPACITY < 60,
    'chứa được cả 60 điểm thì không còn phải chọn gì — ai cấp 60 cũng giống hệt nhau');
});

/* ------------------------------------------------ giá theo nấc -------- */

test('giá mỗi nấc tăng dần 1·1·2·2·3 — đi hết một dòng tốn 9 điểm', () => {
  assert.deepEqual(tree.MASTERY_COST, [1, 1, 2, 2, 3]);
  assert.equal(tree.MASTERY_LINE_COST, 9);
  assert.equal(tree.masteryPointsSpent({ mst_body: 5 }), 9);
  assert.equal(tree.masteryPointsSpent({ mst_body: 3 }), 4, '1 + 1 + 2');
});

test('21 điểm dư mua được hai dòng đầy và một chút — không đủ tô đều sáu dòng', () => {
  assert.equal(tree.masteryPointsSpent({ mst_body: 5, mst_force: 5, mst_guard: 2, mst_edge: 1 }), 21);
  assert.ok(tree.masteryPointsSpent({ mst_body: 5, mst_force: 5, mst_arcane: 5 }) > 21);
});

test('nấc bậy hay quá trần đều bị kẹp lại, không sinh ra điểm âm', () => {
  assert.equal(tree.masteryTier('mst_body', { mst_body: 99 }), tree.MASTERY_TIERS);
  assert.equal(tree.masteryTier('mst_body', { mst_body: -3 }), 0);
  assert.equal(tree.masteryPointsSpent({}), 0);
  assert.equal(tree.masteryPointsSpent(undefined), 0);
});

/* ------------------------------------------------ chỉ số cộng --------- */

test('Tinh Thông cộng thẳng vào cùng bảng với bị động Cây Nền', () => {
  const none = tree.bonuses('warrior', [], {});
  const some = tree.bonuses('warrior', [], { mst_body: 5 });

  assert.equal(none.combat.hpPercent, 0);
  assert.ok(Math.abs(some.combat.hpPercent - 0.05) < 1e-9, 'nấc 5 × 1% = 5%');
});

test('cộng dồn với bị động Cây Nền chứ không thay thế nó', () => {
  const both = tree.bonuses('warrior', ['w_tough'], { mst_body: 5 });
  assert.ok(Math.abs(both.combat.hpPercent - (0.08 + 0.05)) < 1e-9);
});

/* ------------------------------------------------ mở nấc ------------- */

const hero = (over = {}) => ({
  className: 'warrior', level: 60, gold: 100000,
  learned: [...FULL_TREE], skillRanks: { ...FULL_RANKS }, bookRanks: {}, mastery: {},
  carried: ['heavy_slash'], codex: Array(tree.CODEX_SLOTS).fill(null),
  stats: { str: 60, int: 5, vit: 50, agi: 20, wil: 10 }, statPoints: 0,
  ...over,
});

test('còn điểm thì mở được nấc; hết điểm thì câu từ chối nói rõ thiếu bao nhiêu', () => {
  const p = hero();
  assert.equal(tree.masteryBlocked('mst_body', p), null);

  // Dồn hết 21 điểm rồi thì nấc kế tiếp phải bị chặn
  p.mastery = { mst_body: 5, mst_force: 5, mst_guard: 2, mst_edge: 1 };
  const why = tree.masteryBlocked('mst_arcane', p);
  assert.match(why, /Cần 1 điểm/);
});

test('nấc cuối tốn 3 điểm — còn 2 điểm thì chưa mở được', () => {
  const p = hero({ mastery: { mst_body: 4 } });
  // 4 nấc đầu tốn 6 điểm, còn 15 — thừa sức
  assert.equal(tree.masteryBlocked('mst_body', p), null);

  p.learned = FULL_TREE;
  p.mastery = { mst_body: 4, mst_force: 5, mst_guard: 5 };  // 6 + 9 + 9 = 24 > 21
  assert.ok(tree.masteryBlocked('mst_body', p));
});

test('dòng đã kịch nấc thì không mở thêm', () => {
  assert.match(tree.masteryBlocked('mst_body', hero({ mastery: { mst_body: 5 } })), /nấc tối đa/);
});

test('dòng không có thật thì từ chối, không ném lỗi', () => {
  assert.ok(tree.masteryBlocked('khong-co-that', hero()));
});

test('bản gửi client nói sẵn giá nấc kế tiếp và giá trị ĐANG hưởng', () => {
  const view = tree.publicMastery(hero({ mastery: { mst_body: 3 } }));
  const line = view.find((m) => m.id === 'mst_body');

  assert.equal(line.tier, 3);
  assert.equal(line.cost, 2, 'nấc thứ 4 tốn 2 điểm — không nói ra thì người chơi tưởng nấc nào cũng 1');
  assert.match(line.value, /\+3% Máu tối đa/, 'phải là tổng đang hưởng, không phải mức mỗi nấc');
  assert.equal(view.find((m) => m.id === 'mst_force').value, null);
});

/* ------------------------------------------------ rửa chỉ số --------- */

test('rửa chỉ số: mọi chỉ số về 5, trả lại đúng 3 điểm mỗi cấp, trừ vàng', () => {
  const p = hero();
  const price = respec.priceFor('stats', p.level);

  const res = respec.resetStats(p);

  assert.equal(res.ok, true);
  assert.equal(res.points, progression.STAT_POINTS_PER_LEVEL * 59);
  assert.equal(p.statPoints, res.points);
  assert.deepEqual(p.stats, { str: 5, int: 5, vit: 5, agi: 5, wil: 5 });
  assert.equal(p.gold, 100000 - price);
});

test('không đủ vàng thì không rửa, và không mất gì', () => {
  const p = hero({ gold: 10 });
  const res = respec.resetStats(p);

  assert.equal(res.ok, false);
  assert.match(res.error, /vàng/);
  assert.equal(p.stats.str, 60, 'từ chối mà vẫn xoá chỉ số thì tệ hơn cả không cho bấm');
  assert.equal(p.gold, 10);
});

test('chưa tiêu điểm chỉ số nào thì không cho rửa — trả tiền lấy đúng thứ đang có', () => {
  const p = hero({ stats: { str: 5, int: 5, vit: 5, agi: 5, wil: 5 }, statPoints: 177 });
  const res = respec.resetStats(p);

  assert.equal(res.ok, false);
  assert.equal(p.gold, 100000);
});

/* ------------------------------------------------ rửa kỹ năng -------- */

test('rửa kỹ năng: Cây Nền, bậc và Tinh Thông về 0, điểm trả lại hết', () => {
  const p = hero({ mastery: { mst_body: 5 }, bookRanks: {} });
  // 15 (cây) + 24 (bậc) + 9 (Tinh Thông) = 48
  const res = respec.resetSkills(p);

  assert.equal(res.ok, true);
  assert.equal(res.points, 48);
  assert.deepEqual(p.learned, []);
  assert.deepEqual(p.skillRanks, {});
  assert.deepEqual(p.mastery, {});
  assert.equal(tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks, p.mastery), 60);
});

test('rửa kỹ năng KHÔNG đụng tới sách Dị Điển đang gắn', () => {
  const codex = Array(tree.CODEX_SLOTS).fill(null);
  codex[0] = { uid: 'b1', skillId: 'd_venom', name: 'Nọc Độc' };
  const p = hero({ codex, carried: ['heavy_slash', 'd_venom'] });

  respec.resetSkills(p);

  assert.equal(p.codex[0].uid, 'b1', 'sách mất hàng chục giờ mới rơi ra — quét sạch là không thể chấp nhận');
  assert.deepEqual(p.carried, ['d_venom'],
    'chiêu Cây Nền rời bộ mang theo, chiêu Dị Điển ở lại — xoá trắng thì vào trận chỉ còn hai chiêu bẩm sinh');
});

test('bậc lên bằng sách cũng bị xoá cùng — không để lại con số mồ côi', () => {
  const codex = Array(tree.CODEX_SLOTS).fill(null);
  codex[0] = { uid: 'b1', skillId: 'd_venom', name: 'Nọc Độc' };
  const p = hero({ codex, skillRanks: { ...FULL_RANKS, d_venom: 3 }, bookRanks: { d_venom: 2 } });

  respec.resetSkills(p);

  assert.deepEqual(p.bookRanks, {},
    'giữ lại bookRanks sau khi bảng bậc đã trống thì lần nâng bậc sau tính sai');
});

test('chưa tiêu điểm kỹ năng nào thì không cho rửa', () => {
  const p = hero({ learned: [], skillRanks: {}, mastery: {} });
  assert.equal(respec.resetSkills(p).ok, false);
  assert.equal(p.gold, 100000);
});

test('giá rửa tăng theo cấp, và rửa kỹ năng luôn đắt hơn rửa chỉ số', () => {
  for (const lv of [10, 30, 60]) {
    const pr = respec.prices(lv);
    assert.ok(pr.skills > pr.stats);
  }
  assert.ok(respec.priceFor('stats', 60) > respec.priceFor('stats', 30));
  assert.ok(respec.priceFor('stats', 1) >= 200, 'có sàn để cấp 1 không rửa gần như miễn phí');
});
