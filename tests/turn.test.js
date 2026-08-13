'use strict';

/**
 * Nhịp của một vòng lượt: chọn xong là đánh, treo máy thì server đánh thay.
 *
 * Thanh 20 giây dễ bị hiểu nhầm thành thời gian BẮT BUỘC phải chờ. Nó không
 * phải vậy — nó là chốt chặn cho người treo máy, còn đường chạy thường ngày là
 * bấm xong thì trận nổ ra ngay. Bộ test này giữ đúng hai vai đó.
 */

const test = require('node:test');
const assert = require('node:assert');

const { Battle, SELECT_MS, EARLY_MS } = require('../server/battle');
const monsterData = require('../server/data/monsters');

const io = { to: () => ({ emit() {} }) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chờ đủ lâu để hẹn giờ SỚM kịp chạy, nhưng còn xa mốc 20 giây. */
const SETTLE = EARLY_MS + 150;

const player = (id) => ({
  id, name: id, level: 10,
  stats: { str: 20, int: 5, vit: 20, agi: 10, wil: 5 },
});

function battleWith(ids, opts = {}) {
  return new Battle({
    allies: ids.map(player),
    monsterDefs: [monsterData.scaled(monsterData.get('grey_wolf'), 3)],
    io, channel: 'c', ...opts,
  });
}

/* ------------------------------------------------ xong sớm thì đánh sớm -- */

test('đi lẻ: chọn chiêu và mục tiêu xong là xử lý ngay, không chờ hết 20 giây', async (t) => {
  const b = battleWith(['p1']);
  t.after(() => b.destroy());

  assert.equal(b.submit('p1', 'attack', b.enemies[0].id), true);
  assert.equal(b.phase, 'select', 'phải chừa một nhịp cho dấu ✓ kịp hiện');

  await sleep(SETTLE);
  assert.notEqual(b.phase, 'select',
    `vẫn đang chờ sau ${SETTLE}ms — người chơi đứng nhìn thanh 20 giây chạy hết một cách vô nghĩa`);
});

test('đi nhóm: còn người chưa chọn thì vẫn chờ — đó mới là việc của thanh 20 giây', async (t) => {
  const b = battleWith(['p1', 'p2']);
  t.after(() => b.destroy());

  b.submit('p1', 'attack', b.enemies[0].id);
  await sleep(SETTLE);

  assert.equal(b.phase, 'select', 'p2 chưa chọn mà đã xử lý là cướp lượt của họ');
  assert.ok(b.deadline - Date.now() > SELECT_MS - 2000, 'đồng hồ phải vẫn là đồng hồ 20 giây');
});

test('đi nhóm: người cuối cùng bấm xong thì cả vòng chạy luôn', async (t) => {
  const b = battleWith(['p1', 'p2']);
  t.after(() => b.destroy());

  b.submit('p1', 'attack', b.enemies[0].id);
  b.submit('p2', 'attack', b.enemies[0].id);

  await sleep(SETTLE);
  assert.notEqual(b.phase, 'select');
});

test('người đã gục không bị tính là "chưa chọn"', async (t) => {
  const b = battleWith(['p1', 'p2']);
  t.after(() => b.destroy());

  b.byId('p2').alive = false;
  b.submit('p1', 'attack', b.enemies[0].id);

  await sleep(SETTLE);
  assert.notEqual(b.phase, 'select', 'chờ một cái xác bấm nút thì chờ đủ 20 giây, vòng nào cũng vậy');
});

test('người cuối cùng chưa chọn mà RỜI trận thì vòng chạy ngay', async (t) => {
  const b = battleWith(['p1', 'p2'], { boss: true });
  t.after(() => b.destroy());

  b.submit('p1', 'attack', b.enemies[0].id);
  // Rớt mạng, hoặc trốn thoát khỏi trận Thủ Lĩnh — cả hai đều đi qua đây
  b.removeAlly('p2');

  await sleep(SETTLE);
  assert.notEqual(b.phase, 'select',
    'p1 đã chọn xong từ lâu, mà người duy nhất còn lại để chờ thì không còn trong trận');
});

test('trốn thoát cũng là một lựa chọn — bấm xong là xử lý ngay', async (t) => {
  const b = battleWith(['p1']);
  t.after(() => b.destroy());

  assert.equal(b.submit('p1', '__flee', null), true);
  await sleep(SETTLE);
  assert.notEqual(b.phase, 'select');
});

/* ------------------------------------------------ chốt chặn 20 giây ----- */

test('ai không chọn gì thì server đánh thường thay, không để trận đứng im', () => {
  // `auto: false` để gọi tay đúng cái mà đồng hồ 20 giây sẽ gọi
  const b = battleWith(['p1'], { auto: false });
  b.resolveRound();

  assert.equal(b.actions.get('p1').skillId, 'attack',
    'không có hành động thay thế thì một người treo máy khoá cứng cả trận của bốn người còn lại');
});

test('huỷ trận thì hẹn giờ xử lý sớm chết theo', async () => {
  const b = battleWith(['p1']);
  b.submit('p1', 'attack', b.enemies[0].id);
  b.destroy();

  await sleep(SETTLE);
  assert.equal(b.round, 1, 'hẹn giờ thả rông sống tiếp và ôm theo cả trận trong bộ nhớ');
});

test('trận đang xử lý thì không có gì mở thêm một vòng nữa', async (t) => {
  const b = battleWith(['p1', 'p2'], { boss: true });
  t.after(() => b.destroy());

  const before = b.timer;
  b.phase = 'resolve';
  b.removeAlly('p2');

  assert.equal(b.timer, before, 'đặt hẹn giờ trong pha xử lý là đặt một vòng chồng lên vòng đang chạy');
});
