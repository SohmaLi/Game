'use strict';

/**
 * Người Chép Sử — chỗ giao và trả nhiệm vụ ở Bến Cảng Duskmoor.
 *
 * Hai thứ dễ hỏng ở đây:
 *
 *   - **Nhận hết một lượt phải bằng đúng nhận từng cái.** Nút tiện tay mà cộng
 *     dư một đồng vàng thì nó thành nút đẻ vàng, và mọi con số cân bằng khác
 *     thành vô nghĩa.
 *   - **Hai người đứng cùng một quảng trường.** Từ ngày có NPC thứ hai, `npcId`
 *     đi lên từ client không còn đủ để biết đang nói chuyện với ai làm nghề gì.
 */

const test = require('node:test');
const assert = require('node:assert');

const quests = require('../server/quests');
const zones = require('../server/data/zones');
const npcs = require('../server/data/npcs');
const mapLib = require('../server/map');
const Room = require('../server/room');
const inventory = require('../server/inventory');
const tree = require('../server/data/skilltree');

const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };

const hero = (over = {}) => ({
  id: 'p1', name: 'Link', characterId: 6,
  level: 28, gold: 0, exp: 0,
  codex: Array(tree.CODEX_SLOTS).fill(null),
  inv: inventory.create(),
  books: [], quests: null,
  ...over,
});

const kills = (n, id, tier = 'common') =>
  Array.from({ length: n }, () => ({ id, tier }));

/* ---------------------------------------------------- chỗ đứng --------- */

test('Người Chép Sử đứng trong thị trấn, trên ô trống, cạnh thương nhân', () => {
  const scribe = npcs.get('scribe');
  assert.ok(scribe, 'không có ông ta thì không ai giao việc');
  assert.equal(scribe.kind, 'quest');
  assert.ok(zones.get('duskmoor').npcs.includes('scribe'),
    'khai NPC mà không cắm vào vùng nào thì cả game không ai gặp được');

  const map = mapLib.forZone(zones.get('duskmoor'));
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      assert.equal(map.isWallTile(scribe.tile.x + dx, scribe.tile.y + dy), false,
        `ô (${scribe.tile.x + dx}, ${scribe.tile.y + dy}) quanh ông ta bị xe hàng đè`);
    }
  }
});

test('hai NPC đứng đủ xa để tầm nói chuyện không chồng lên nhau', () => {
  const placed = npcs.forZone(zones.get('duskmoor'));
  for (const a of placed) {
    for (const b of placed) {
      if (a.id === b.id) continue;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > npcs.TALK_RADIUS * 2,
        `${a.id} và ${b.id} đứng chồng tầm — client lấy người ĐẦU danh sách,`
        + ' nên bấm E ra nhầm cửa sổ');
    }
  }
});

test('đứng cạnh người này không mở được cửa sổ của người kia', () => {
  const room = new Room('pve', io, zones.get('duskmoor'));
  try {
    const p = room.add({ id: 's1', join() {}, leave() {} }, 'Linh', null);
    const scribe = room.npcs.find((n) => n.id === 'scribe');

    p.x = scribe.x;
    p.y = scribe.y;

    assert.ok(room.npcNear(p, 'scribe', 'quest'), 'đứng ngay trước mặt mà không nói chuyện được');
    assert.equal(room.npcNear(p, 'scribe', 'shop'), null,
      'mở được quầy hàng trên bàn Người Chép Sử — `npcId` từ client không được tin');
    assert.equal(room.npcNear(p, 'merchant', 'shop'), null, 'thương nhân đứng cách 4 ô');

    p.x = scribe.x + npcs.TALK_RADIUS + 20;
    assert.equal(room.npcNear(p, 'scribe', 'quest'), null, 'đi xa rồi mà vẫn giao được việc');
  } finally {
    room.stopLoop();
  }
});

/* -------------------------------------------------- nhận hết một lượt -- */

test('chưa xong việc nào thì nút Nhận tất cả từ chối, không im lặng trả về rỗng', () => {
  // Cấp 1, chưa đánh trận nào — cấp 28 thôi đã xong sẵn cột mốc "lên cấp 20"
  const p = hero({ level: 1 });
  const res = quests.claimAll(p);
  assert.equal(res.ok, false);
  assert.match(res.error, /Chưa có việc nào/);
  assert.equal(p.gold, 0);
});

test('nhận hết một lượt bằng ĐÚNG tổng của từng lần nhận riêng lẻ', () => {
  const goal = zones.get('meadow').monsters[0];

  const a = hero();
  const b = hero();
  quests.recordKills(a, kills(20, goal));
  quests.recordKills(b, kills(20, goal));

  // a: bấm từng nút một, đúng như khi đứng giữa đồng cỏ. Cùng thứ tự với
  // `claimAll` — việc hàng ngày trước, vì mốc của nó co giãn theo cấp
  const view = quests.stateFor(a);
  const ids = [...view.dailies, ...view.zones, ...view.milestones]
    .filter((q) => q.claimable).map((q) => q.id);
  assert.ok(ids.length >= 2, 'hạ 20 con mà không xong việc nào thì bài này vô nghĩa');
  const one = ids.map((id) => quests.claim(a, id));
  assert.ok(one.every((r) => r.ok));

  // b: bấm một nút ở chỗ Người Chép Sử
  const all = quests.claimAll(b);

  assert.equal(all.ok, true);
  assert.equal(all.count, ids.length);
  assert.equal(all.skipped, 0);
  assert.equal(b.gold, a.gold, 'nhận hết một lượt mà lệch vàng là một nút đẻ vàng');
  assert.equal(b.level, a.level);
  assert.equal(b.exp, a.exp);
  assert.equal((b.books || []).length, (a.books || []).length);
  assert.equal(all.gold, one.reduce((s, r) => s + r.gold, 0));
  assert.equal(all.exp, one.reduce((s, r) => s + r.exp, 0));
});

test('nhận hết rồi thì bấm lần hai không ra thêm đồng nào', () => {
  const p = hero();
  quests.recordKills(p, kills(20, zones.get('meadow').monsters[0]));

  const first = quests.claimAll(p);
  const gold = p.gold;
  assert.ok(first.count >= 1);

  const second = quests.claimAll(p);
  assert.equal(second.ok, false);
  assert.equal(p.gold, gold);
});

test('việc đang làm dở không bị cuốn theo', () => {
  const p = hero();
  const goal = zones.get('meadow').monsters[0];
  quests.recordKills(p, kills(20, goal));

  quests.claimAll(p);

  const view = quests.stateFor(p);
  const chuaXong = view.zones.filter((q) => !q.claimed);
  assert.ok(chuaXong.length > 0, 'không lẽ hạ 20 con sói là xong sạch 18 việc vùng');
  for (const q of chuaXong) {
    assert.equal(q.claimable, false, `"${q.id}" chưa đủ mốc mà vẫn hiện nút nhận`);
  }
});
