'use strict';

/**
 * Cái giá của thất bại.
 *
 * Trước đây thua trận không mất gì cả — `applyRewards` thoát ngay ở dòng đầu khi
 * kết quả không phải 'win', và máu ngoài bản đồ thì không bao giờ đổi. Nghĩa là
 * lao vào Thủ Lĩnh một mình rồi thua có giá đúng bằng 0, và nút Trốn thoát chưa
 * bao giờ là một lựa chọn thật.
 *
 * Hai thứ phải giữ bằng mọi giá: KHÔNG tụt cấp, và KHÔNG mất đồ.
 */

const test = require('node:test');
const assert = require('node:assert');
const progression = require('../server/progression');
const cfg = require('../server/config');

const PCT = cfg.DEATH.expLossPct;

/* ------------------------------------------------ trừ kinh nghiệm --- */

test('thua thì mất đúng phần trăm kinh nghiệm CỦA CẤP HIỆN TẠI', () => {
  const need = progression.expToNext(20);
  const char = { level: 20, exp: need - 1 };

  const res = progression.loseExp(char, PCT);

  assert.equal(res.lost, Math.round(need * PCT));
  assert.equal(char.exp, need - 1 - res.lost);
  assert.equal(char.level, 20, 'cấp không được đụng tới');
});

test('kinh nghiệm không bao giờ xuống dưới 0, và không tụt cấp', () => {
  const char = { level: 30, exp: 5 };

  const res = progression.loseExp(char, PCT);

  assert.equal(res.lost, 5, 'chỉ trừ được đúng những gì đang có');
  assert.equal(char.exp, 0);
  assert.equal(char.level, 30);
});

test('vừa lên cấp xong mà thua thì mất trắng 0', () => {
  const char = { level: 12, exp: 0 };
  assert.equal(progression.loseExp(char, PCT).lost, 0);
  assert.equal(char.exp, 0);
});

test('cấp trần thì không còn gì để mất', () => {
  const char = { level: progression.MAX_LEVEL, exp: 0 };
  const res = progression.loseExp(char, PCT);

  // `expToNext` trả Infinity ở cấp trần — chỗ dễ ra NaN nhất trong cả hàm
  assert.equal(res.lost, 0);
  assert.equal(Number.isFinite(char.exp), true);
  assert.equal(char.exp, 0);
});

test('mất rồi cày lại đúng chỗ cũ thì về lại chỗ cũ', () => {
  const need = progression.expToNext(15);
  const char = { level: 15, exp: Math.round(need * 0.8), statPoints: 0, stats: {} };

  const { lost } = progression.loseExp(char, PCT);
  progression.addExp(char, lost);

  assert.equal(char.exp, Math.round(need * 0.8));
  assert.equal(char.level, 15, 'không có cấp nào bị mất rồi lấy lại');
});

/* ------------------------------------------------ hằng số ----------- */

test('hình phạt phải đau nhưng không tàn nhẫn: 5% – 25% một cấp', () => {
  // Chốt chặn cho những lần chỉnh cân bằng sau. Dưới 5% thì không ai để ý là có
  // hình phạt; trên 25% thì một trận xui xoá sạch công của hai trận thắng.
  assert.ok(PCT >= 0.05 && PCT <= 0.25, `expLossPct = ${PCT} nằm ngoài khoảng an toàn`);
});

test('người thua được miễn va chạm lâu hơn người thắng', () => {
  // Bị thả xuống một chỗ lạ giữa bản đồ mà chỉ có 5 giây như lúc thắng là chuỗi
  // thua liên tiếp không có lối ra
  assert.ok(cfg.DEATH.graceMs > cfg.ROAMER.graceMs);
});

/* ------------------------------------------------ cả đường đi ------- */

const Room = require('../server/room');
const zones = require('../server/data/zones');

/** io giả ghi lại mọi gói gửi đi, để soi được cả phần client sẽ nhận. */
function makeRoom() {
  const sent = [];
  const io = {
    to: (target) => ({ emit: (ev, data) => sent.push({ target, ev, data }) }),
    sockets: { sockets: new Map() },
  };
  const room = new Room('pve', io, zones.get('meadow'));
  room.sent = sent;
  return room;
}

function addPlayer(room, id = 'p1') {
  const p = room.add({ id, join() {} }, id);
  p.level = 20;
  p.exp = progression.expToNext(20) - 1;
  p.gold = 500;
  return p;
}

/** Trận giả — `applyRewards` và `endBattle` chỉ đọc `allies` và `result`. */
const fakeBattle = (result, ids) => ({
  id: 'b1', channel: 'ch', result, boss: false,
  allies: ids.map((id) => ({ id, rage: 0, karma: 0 })),
  destroy() {},
});

test('thua một trận thật thì kinh nghiệm bị trừ và gói `defeat` bay về đúng người', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  const p = addPlayer(room);
  const before = p.exp;

  room.applyRewards(fakeBattle('lose', [p.id]), 'lose', null);

  assert.ok(p.exp < before, 'trước đây chỗ này thoát ngay ở dòng đầu — thua không mất gì');
  assert.equal(p.gold, 500, 'vàng không được đụng tới');
  assert.equal(p.level, 20);

  const msg = room.sent.find((s) => s.ev === 'defeat');
  assert.ok(msg, 'không có gói nào thì bảng kết quả không biết nói mất bao nhiêu');
  assert.equal(msg.target, p.id);
  assert.equal(msg.data.expLost, before - p.exp);
});

test('trốn thoát và bất phân thắng bại thì KHÔNG mất gì', (t) => {
  for (const result of ['fled', 'draw']) {
    const room = makeRoom();
    t.after(() => room.stopLoop());
    const p = addPlayer(room);
    const before = p.exp;

    room.applyRewards(fakeBattle(result, [p.id]), result, null);

    assert.equal(p.exp, before, `${result} không được trừ kinh nghiệm`);
    assert.equal(room.sent.filter((s) => s.ev === 'defeat').length, 0);
  }
});

test('cả nhóm thua thì hồi sinh CÙNG một chỗ, không bị ném ra mỗi người một góc', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  const a = addPlayer(room, 'a');
  const b = addPlayer(room, 'b');
  // Ghim điểm hồi sinh: bốc ngẫu nhiên trên 1200 ô thì có ngày nó trả về đúng
  // chỗ cũ và bài test đỏ lên vì lý do chẳng liên quan gì tới thứ đang kiểm
  room.map.randomSpawn = () => ({ x: 999, y: 888 });

  const battle = fakeBattle('lose', ['a', 'b']);
  room.battles.set(battle.id, battle);
  room.endBattle(battle);

  assert.equal(a.x, 999);
  assert.equal(a.y, 888);
  assert.equal(b.x, a.x, 'cả nhóm phải tỉnh lại cùng một chỗ');
  assert.equal(b.y, a.y);
  assert.ok(a.graceUntil - Date.now() > cfg.ROAMER.graceMs, 'miễn va chạm phải dài hơn lúc thắng');
});

test('một trận THẬT thua thì cả dây chuyền chạy: finish → onEnd → trừ kinh nghiệm', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  const p = addPlayer(room);
  const before = p.exp;

  // Trận dựng bằng chính `startBattle`, không phải đồ giả: chỗ dễ hỏng nhất là
  // sợi dây `onEnd` nối Battle với Room, mà đồ giả thì đi vòng qua đúng chỗ đó
  const mobs = [...room.roamers.values()].slice(0, 2);
  const battle = room.startBattle(mobs, p);
  assert.ok(battle, 'không dựng nổi trận thì phần còn lại vô nghĩa');

  battle.finish('lose');
  assert.equal(battle.result, 'lose', '`endBattle` đọc cờ này để biết thả người chơi ở đâu');
  assert.equal(p.exp, before - Math.round(progression.expToNext(20) * PCT));

  room.endBattle(battle);
  assert.equal(p.battleId, null);
});

test('thắng thì đứng nguyên tại chỗ vừa đánh', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  const p = addPlayer(room);
  const spot = { x: p.x, y: p.y };

  const battle = fakeBattle('win', [p.id]);
  room.battles.set(battle.id, battle);
  room.endBattle(battle);

  assert.equal(p.x, spot.x);
  assert.equal(p.y, spot.y);
});
