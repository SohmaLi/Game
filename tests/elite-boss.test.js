'use strict';

/**
 * Quái Tinh Anh trên bản đồ, và cơ chế riêng của từng Thủ Lĩnh.
 *
 * Hai thứ này từng nằm ở mục "chưa xong" khá lâu vì cùng một lý do: hạng Tinh
 * Anh có sẵn trong `TIER` nhưng không con nào lọt được ra bản đồ, còn Thủ Lĩnh
 * thì sáu con dùng chung đúng một bộ luật — đánh con thứ sáu y hệt con thứ nhất.
 */

const test = require('node:test');
const assert = require('node:assert');

const cfg = require('../server/config');
const monsterData = require('../server/data/monsters');
const zones = require('../server/data/zones');
const roamer = require('../server/roamer');
const mapLib = require('../server/map');
const { Battle } = require('../server/battle');
const Room = require('../server/room');

const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };

/* ------------------------------------------------ dữ liệu ----------- */

test('mọi vùng săn quái đều có đúng danh sách Tinh Anh dùng được', () => {
  for (const z of zones.ZONES) {
    if (z.safe) continue;
    assert.ok(z.elites?.length, `${z.id} không có con Tinh Anh nào — hạng này lại vô hình như trước`);
    for (const id of z.elites) {
      const m = monsterData.get(id);
      assert.ok(m, `${z.id} trỏ tới "${id}" không tồn tại`);
      assert.equal(m.tier, 'elite', `"${id}" nằm trong danh sách Tinh Anh mà hạng lại là ${m.tier}`);
      assert.equal(m.skills.length, 3, `Tinh Anh phải có 3 kỹ năng (DESIGN.md §6.2), "${id}" có ${m.skills.length}`);
    }
  }
});

test('mọi Thủ Lĩnh đều có cơ chế riêng, và cơ chế nào cũng có bộ máy chạy nó', () => {
  const KNOWN = ['summon', 'enrage', 'regen'];
  const bosses = monsterData.MONSTERS.filter((m) => m.tier === 'boss');
  assert.ok(bosses.length >= 6);

  for (const b of bosses) {
    assert.ok(b.mechanics?.length, `"${b.id}" không có cơ chế nào — nó chỉ là con quái nhiều máu`);
    for (const m of b.mechanics) {
      assert.ok(KNOWN.includes(m.type), `"${b.id}" khai cơ chế "${m.type}" mà Battle không biết chạy`);
      assert.ok(m.label, 'thiếu tên thì nhật ký trận in ra một dòng trống');
      if (m.type === 'summon') {
        assert.ok(monsterData.get(m.minion), `"${b.id}" gọi "${m.minion}" không tồn tại`);
        assert.ok(m.every > 0 && m.count > 0 && m.max > 0);
      }
    }
  }
});

/* ------------------------------------------------ trên bản đồ ------- */

function makeRoom(zoneId = 'meadow') {
  return new Room('pve', io, zones.get(zoneId));
}

test('bản đồ đổ đầy đúng số quái, và Tinh Anh không vượt trần', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  room.fillRoamers();

  assert.equal(room.roamers.size, cfg.ROAMER.count);
  const elites = [...room.roamers.values()].filter((r) => r.elite);
  assert.equal(elites.length, cfg.ROAMER.eliteMax,
    'bù cho đủ trần Tinh Anh TRƯỚC khi đổ quái thường, không thì con vừa bị hạ gần như không quay lại');
});

test('hạ một con Tinh Anh thì con khác thế chỗ, không phải chờ hết quái thường', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  room.fillRoamers();

  const victim = [...room.roamers.values()].find((r) => r.elite);
  room.roamers.delete(victim.id);
  room.fillRoamers();

  assert.equal([...room.roamers.values()].filter((r) => r.elite).length, cfg.ROAMER.eliteMax);
});

test('chạm phải Tinh Anh thì đánh TAY ĐÔI, không kéo theo quái thường đứng cạnh', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  room.fillRoamers();

  const elite = [...room.roamers.values()].find((r) => r.elite);
  // Dồn hết quái thường đứng đè lên con Tinh Anh — trường hợp xấu nhất
  for (const r of room.roamers.values()) { r.x = elite.x; r.y = elite.y; }

  const group = room.groupAround(elite);
  assert.deepEqual(group.map((g) => g.id), [elite.id],
    'máu ×2.2 và sát thương ×1.5 rồi còn kéo thêm cả bầy thì không ai đi lẻ thắng nổi');
});

test('chạm phải quái thường thì con Tinh Anh đứng cạnh cũng KHÔNG bị lôi vào', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  room.fillRoamers();

  const elite = [...room.roamers.values()].find((r) => r.elite);
  const common = [...room.roamers.values()].find((r) => !r.elite);
  elite.x = common.x;
  elite.y = common.y;

  assert.equal(room.groupAround(common).some((g) => g.elite), false);
});

test('Tinh Anh mượn hình quái thường nhưng vẫn tự khai hạng của mình', () => {
  const def = monsterData.get('void_sentinel');
  const r = new roamer.Roamer(monsterData.scaled(def, 60), { x: 100, y: 100 });
  const s = r.serialize();

  assert.equal(s.el, true, 'không có cờ này thì client vẽ nó y hệt một con quái thường');
  assert.equal(s.mid, 'void_wraith', 'khoá tra hình là hình MƯỢN, không phải id của chính nó');
  assert.equal(r.radius, cfg.ELITE.radius);
});

/* ------------------------------------------------ trong trận -------- */

const ally = () => ({ id: 'p1', name: 'Thử', level: 60, stats: { str: 40, int: 40, vit: 40, agi: 40, wil: 40 } });

/** Trận không đồng hồ — `auto: false` để chạy tay từng vòng. */
function battleWith(bossId, level = 20) {
  return new Battle({
    allies: [ally()],
    monsterDefs: [monsterData.scaled(monsterData.get(bossId), level)],
    io, channel: 'sim', auto: false,
  });
}

test('Thủ Lĩnh gọi quân đúng nhịp, và tay sai theo CẤP CỦA NÓ', () => {
  const b = battleWith('alpha_wolf', 20);
  const boss = b.enemies[0];

  b.round = 2;
  const events = b.runMechanics();

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'summon');
  assert.equal(b.enemies.length, 3, 'gọi 2 con thì phải có thêm 2 thẻ quái trong trận');
  for (const m of b.enemies.slice(1)) {
    assert.equal(m.level, boss.level,
      'lấy cấp gốc bản mẫu thì ở vùng cấp 60 nó gọi ra một bầy sói cấp 1 đứng làm cảnh');
  }
});

test('không gọi quân ở vòng chưa tới nhịp', () => {
  const b = battleWith('alpha_wolf');
  b.round = 1;
  assert.deepEqual(b.runMechanics(), []);
  assert.equal(b.enemies.length, 1);
});

test('tay sai gọi ra có id RIÊNG, gọi bao nhiêu lượt cũng không trùng', () => {
  const b = battleWith('alpha_wolf');
  b.round = 2; b.runMechanics();
  // Giết sạch lứa đầu rồi gọi lứa hai — chỗ mà cách đếm theo `enemies.length`
  // sẽ dựng ra hai con cùng id, và `byId` chỉ thấy được con tìm ra trước
  for (const m of b.enemies.slice(1)) m.alive = false;
  b.round = 4; b.runMechanics();

  const ids = b.enemies.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, `id trùng nhau: ${ids.join(', ')}`);
});

test('gọi quân có TRẦN — không thì trận kéo tới vòng 50 rồi hoà', () => {
  const b = battleWith('alpha_wolf');
  const cap = monsterData.get('alpha_wolf').mechanics[0].max;

  for (let r = 2; r <= 40; r += 2) { b.round = r; b.runMechanics(); }

  assert.equal(b.enemies.length - 1, cap);
});

test('hoá cuồng chỉ nổ MỘT LẦN, và chỉ khi máu đã xuống dưới ngưỡng', () => {
  const b = battleWith('ice_troll', 40);
  const boss = b.enemies[0];
  const m = monsterData.get('ice_troll').mechanics.find((x) => x.type === 'enrage');
  const before = boss.damageMult;

  assert.deepEqual(b.doEnrage(boss, m), [], 'máu đầy thì chưa được nổi giận');

  boss.hp = Math.floor(boss.hpMax * m.atPercent) - 1;
  assert.equal(b.doEnrage(boss, m).length, 1);
  assert.ok(Math.abs(boss.damageMult - before * m.damageMult) < 1e-9);

  // Gọi lại: nếu không chốt thì mỗi vòng nó lại nhân thêm một lần nữa
  assert.deepEqual(b.doEnrage(boss, m), []);
  assert.ok(Math.abs(boss.damageMult - before * m.damageMult) < 1e-9);
});

test('tự liền vết thương không bao giờ vượt quá máu tối đa', () => {
  const b = battleWith('ice_troll', 40);
  const boss = b.enemies[0];
  const m = monsterData.get('ice_troll').mechanics.find((x) => x.type === 'regen');

  assert.deepEqual(b.doRegen(boss, m), [], 'đang đầy máu thì không có gì để hồi');

  boss.hp = 1;
  const ev = b.doRegen(boss, m);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].via, m.label, 'client đọc `via` để in tên cơ chế vào nhật ký');

  boss.hp = boss.hpMax - 1;
  b.doRegen(boss, m);
  assert.equal(boss.hp, boss.hpMax);
});

test('trận đã kết thúc thì không cơ chế nào nổ thêm', () => {
  const b = battleWith('alpha_wolf');
  b.finish('win');
  b.round = 2;

  // `endOfRound` là chỗ duy nhất gọi `runMechanics`, và nó phải im khi trận xong
  assert.deepEqual(b.endOfRound().filter((e) => e.type === 'mechanic'), []);
  assert.equal(b.enemies.length, 1);
});
