'use strict';

/**
 * Cửa hàng và vùng an toàn.
 *
 * Hai thứ dễ hỏng âm thầm nhất ở đây, và cũng là hai thứ hỏng thì đau nhất:
 *
 *   - **Vòng lặp đẻ vàng.** Mua rồi bán lại mà lãi thì người chơi ngồi bấm hai
 *     nút là giàu, và mọi con số cân bằng khác thành vô nghĩa.
 *   - **Quầy hàng quay lại được.** Nếu thoát phòng rồi vào lại mà bốc quầy mới
 *     thì cái giới hạn "không bán đồ hạng cao" không chặn được gì — cứ ra vào
 *     đủ lâu là gom được cả bộ.
 */

const test = require('node:test');
const assert = require('node:assert');

const shop = require('../server/shop');
const items = require('../server/data/items');
const inventory = require('../server/inventory');
const zones = require('../server/data/zones');
const npcs = require('../server/data/npcs');
const mapLib = require('../server/map');
const Room = require('../server/room');
const cfg = require('../server/config');

const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };

function fakePlayer(over = {}) {
  return {
    id: 's1', characterId: 7, name: 'Linh', level: 26, gold: 10_000,
    nation: null, inv: inventory.create(), ...over,
  };
}

/* ---------------------------------------------------------- giá cả ------- */

test('mua luôn đắt hơn bán — không có vòng lặp mua đi bán lại để đẻ vàng', () => {
  for (const rarity of items.RARITY_ORDER) {
    for (const level of [1, 10, 30, 60]) {
      for (const nation of [null, 'duskmoor', 'corvane']) {
        const it = items.generate(level, { rarity });
        assert.ok(
          shop.buyPrice(it, nation) > shop.sellPrice(it, nation) * 2,
          `${rarity} cấp ${level} (${nation}): mua ${shop.buyPrice(it, nation)} phải cao hơn hẳn bán ${shop.sellPrice(it, nation)}`
        );
      }
    }
  }
});

test('hạng cao hơn thì đáng giá hơn, ở mọi cấp', () => {
  for (const level of [1, 25, 60]) {
    let prev = 0;
    for (const rarity of items.RARITY_ORDER) {
      const v = shop.value(items.generate(level, { rarity }));
      assert.ok(v > prev, `${rarity} cấp ${level} phải đáng giá hơn hạng dưới nó`);
      prev = v;
    }
  }
});

test('Duskmoor trả đúng một nửa phí giao dịch — đặc quyền Mối Lợi cuối cùng có tác dụng', () => {
  assert.equal(shop.feeFor('duskmoor'), shop.BASE_FEE * 0.5);
  assert.equal(shop.feeFor('corvane'), shop.BASE_FEE);
  assert.equal(shop.feeFor(null), shop.BASE_FEE);

  const it = items.generate(30, { rarity: 'rare' });
  assert.ok(shop.sellPrice(it, 'duskmoor') > shop.sellPrice(it, 'corvane'), 'Duskmoor bán được giá hơn');
  assert.ok(shop.buyPrice(it, 'duskmoor') < shop.buyPrice(it, 'corvane'), 'Duskmoor mua rẻ hơn');
});

/* -------------------------------------------------------- quầy hàng ------ */

test('quầy hàng KHÔNG bao giờ có đồ Sử Thi hay Truyền Thuyết', () => {
  // Quét nhiều khung thời gian và nhiều cấp: hạng cao chỉ được rơi ra từ quái,
  // mua được ở chợ là cả hệ thống rớt đồ mất ý nghĩa
  for (let win = 0; win < 60; win++) {
    for (const level of [1, 20, 45, 60]) {
      const p = fakePlayer({ level, characterId: 100 + win });
      for (const it of shop.rollStock(p, win * shop.RESTOCK_MS)) {
        assert.ok(['common', 'fine', 'rare'].includes(it.rarity),
          `quầy hàng lọt món hạng ${it.rarity}`);
      }
    }
  }
});

test('cùng nhân vật, cùng khung thời gian thì quầy hàng y hệt — thoát ra vào lại không bốc lại được', () => {
  const now = 5 * shop.RESTOCK_MS + 1234;
  const a = shop.rollStock(fakePlayer(), now);
  const b = shop.rollStock(fakePlayer(), now);
  assert.deepEqual(
    a.map((i) => [i.name, i.level, i.rarity, i.stats]),
    b.map((i) => [i.name, i.level, i.rarity, i.stats]),
  );
});

test('qua khung thời gian mới thì quầy đổi hàng', () => {
  const a = shop.rollStock(fakePlayer(), 5 * shop.RESTOCK_MS);
  const b = shop.rollStock(fakePlayer(), 6 * shop.RESTOCK_MS);
  assert.notDeepEqual(a.map((i) => i.name + i.level), b.map((i) => i.name + i.level));
});

test('hai nhân vật khác nhau thấy hai quầy khác nhau', () => {
  const now = 3 * shop.RESTOCK_MS;
  const a = shop.rollStock(fakePlayer({ characterId: 1 }), now);
  const b = shop.rollStock(fakePlayer({ characterId: 2 }), now);
  assert.notDeepEqual(a.map((i) => i.name + i.level), b.map((i) => i.name + i.level));
});

test('cấp món bám sát cấp người chơi', () => {
  for (const level of [1, 15, 40, 60]) {
    for (const it of shop.rollStock(fakePlayer({ level }))) {
      assert.ok(it.level >= 1, 'không có món cấp 0');
      assert.ok(it.level <= level + 2, `cấp ${it.level} vượt quá tầm của người cấp ${level}`);
      assert.ok(it.level >= level - 3, `cấp ${it.level} thấp hơn hẳn người cấp ${level}`);
    }
  }
});

/* ------------------------------------------------------------ mua -------- */

test('mua thì trừ vàng, món rời quầy và vào túi', () => {
  const p = fakePlayer();
  const stock = shop.stockFor(p);
  const item = stock[0];
  const price = shop.buyPrice(item, p.nation);
  const gold = p.gold;

  const res = shop.buy(p, item.uid, inventory);
  assert.ok(res.ok);
  assert.equal(p.gold, gold - price);
  assert.equal(p.inv.bag.length, 1);
  assert.equal(p.inv.bag[0].uid, item.uid);
  assert.equal(shop.stockFor(p).length, shop.STOCK_SIZE - 1);
});

test('mua lại đúng món vừa mua thì bị từ chối', () => {
  const p = fakePlayer();
  const uid = shop.stockFor(p)[0].uid;
  assert.ok(shop.buy(p, uid, inventory).ok);
  assert.equal(shop.buy(p, uid, inventory).ok, false);
});

test('không đủ vàng thì không mua được, và vàng không âm', () => {
  const p = fakePlayer({ gold: 1 });
  const res = shop.buy(p, shop.stockFor(p)[0].uid, inventory);
  assert.equal(res.ok, false);
  assert.equal(p.gold, 1);
  assert.equal(p.inv.bag.length, 0);
});

test('túi đầy thì không mua được — thà từ chối còn hơn nuốt mất món vừa trả tiền', () => {
  const p = fakePlayer();
  for (let i = 0; i < inventory.BAG_SIZE; i++) inventory.addItem(p.inv, items.generate(1));
  const gold = p.gold;

  const res = shop.buy(p, shop.stockFor(p)[0].uid, inventory);
  assert.equal(res.ok, false);
  assert.equal(p.gold, gold, 'từ chối rồi thì không được trừ vàng');
});

/* ------------------------------------------------------------ bán -------- */

test('bán nhiều món cùng lúc thì cộng đúng tổng và món rời khỏi túi', () => {
  const p = fakePlayer({ gold: 0 });
  const a = items.generate(20, { rarity: 'common' });
  const b = items.generate(20, { rarity: 'rare' });
  const keep = items.generate(20, { rarity: 'fine' });
  for (const it of [a, b, keep]) inventory.addItem(p.inv, it);

  const res = shop.sell(p, [a.uid, b.uid]);
  assert.ok(res.ok);
  assert.equal(p.gold, shop.sellPrice(a, null) + shop.sellPrice(b, null));
  assert.equal(res.gold, p.gold);
  assert.deepEqual(p.inv.bag.map((i) => i.uid), [keep.uid], 'món không tick phải còn nguyên');
});

test('bán KHÔNG bao giờ đụng tới đồ đang mặc', () => {
  const p = fakePlayer({ gold: 0 });
  const worn = items.generate(20, { rarity: 'legendary', slot: 'chest' });
  inventory.addItem(p.inv, worn);
  inventory.equip(p.inv, worn.uid);
  assert.equal(p.inv.equipped.chest.uid, worn.uid);

  // uid của món đang mặc lọt vào danh sách (tick nhầm, hoặc client cố tình)
  const res = shop.sell(p, [worn.uid]);
  assert.equal(res.ok, false);
  assert.equal(p.gold, 0);
  assert.equal(p.inv.equipped.chest.uid, worn.uid, 'món trên người phải còn nguyên');
});

test('danh sách rỗng hoặc uid không có thật thì không cộng vàng', () => {
  const p = fakePlayer({ gold: 500 });
  assert.equal(shop.sell(p, []).ok, false);
  assert.equal(shop.sell(p, ['khong-co-that']).ok, false);
  assert.equal(p.gold, 500);
});

/* ------------------------------------------------------ vùng an toàn ----- */

test('vùng an toàn không sinh quái, không hẹn giờ Thủ Lĩnh', () => {
  const zone = zones.get('duskmoor');
  assert.equal(zone.safe, true);

  const room = new Room('pve', io, zone);
  const player = room.add({ id: 's1', join() {}, leave() {} }, 'Linh', null);
  try {
    room.tick();
    room.tick();
    assert.equal(room.roamers.size, 0, 'không con quái nào được sinh ra');
    assert.equal(room.boss, null);
    assert.equal(room.snapshot().boss, null, 'client phải giấu hẳn thanh Thủ Lĩnh đi');
    assert.equal(player.battleId, null);
  } finally {
    room.stopLoop();
  }
});

test('vùng săn quái vẫn sinh quái như cũ', () => {
  const room = new Room('pve', io, zones.get('meadow'));
  try {
    room.add({ id: 's2', join() {}, leave() {} }, 'Linh', null);
    assert.equal(room.roamers.size, cfg.ROAMER.count);
  } finally {
    room.stopLoop();
  }
});

test('vùng an toàn để mặc `defaultFor` chọn vùng săn quái, không thả người chơi vào thị trấn', () => {
  for (const lv of [1, 5, 25, 60]) {
    assert.equal(zones.defaultFor(lv).safe, undefined,
      `cấp ${lv} không được rơi vào vùng an toàn khi không chọn bản đồ`);
  }
});

/* ------------------------------------------------------ bản đồ thị trấn -- */

test('quảng trường quanh thương nhân luôn trống — không xe hàng nào mọc đè lên', () => {
  const zone = zones.get('duskmoor');
  const map = mapLib.forZone(zone);
  const npc = npcs.forZone(zone)[0];

  for (let dy = -mapLib.PLAZA_RADIUS; dy <= mapLib.PLAZA_RADIUS; dy++) {
    for (let dx = -mapLib.PLAZA_RADIUS; dx <= mapLib.PLAZA_RADIUS; dx++) {
      assert.equal(map.isWallTile(npc.tile.x + dx, npc.tile.y + dy), false,
        `ô (${npc.tile.x + dx}, ${npc.tile.y + dy}) trong quảng trường bị chặn`);
    }
  }
});

test('đứng xa thì không mua bán được — server không tin cái nút client vẽ ra', () => {
  const zone = zones.get('duskmoor');
  const room = new Room('pve', io, zone);
  try {
    const p = room.add({ id: 's3', join() {}, leave() {} }, 'Linh', null);
    const npc = room.npcs[0];

    p.x = npc.x + npcs.TALK_RADIUS + 30;
    p.y = npc.y;
    assert.equal(room.npcNear(p, 'merchant'), null);

    p.x = npc.x + npcs.TALK_RADIUS - 5;
    assert.ok(room.npcNear(p, 'merchant'), 'đứng trong tầm thì phải nói chuyện được');

    assert.equal(room.npcNear(p, 'khong-co-npc-nay'), null);
  } finally {
    room.stopLoop();
  }
});

test('vị trí lưu rơi trúng tường thì bỏ qua, không để nhân vật kẹt cứng', () => {
  const zone = zones.get('duskmoor');
  const map = mapLib.forZone(zone);

  // Tìm một ô tường thật trên bản đồ thị trấn
  let wall = null;
  for (let y = 0; y < 30 && !wall; y++) {
    for (let x = 0; x < 40; x++) {
      if (map.isWallTile(x, y)) { wall = { x, y }; break; }
    }
  }
  assert.ok(wall, 'bản đồ phải có ít nhất một ô tường');

  const room = new Room('pve', io, zone);
  try {
    const pos = { x: wall.x * cfg.TILE + cfg.TILE / 2, y: wall.y * cfg.TILE + cfg.TILE / 2 };
    const p = room.add({ id: 's4', join() {}, leave() {} }, 'Linh', { level: 1, pos, stats: {} });
    assert.ok(!map.collides(p.x, p.y, cfg.PLAYER_RADIUS), 'không được đặt nhân vật vào trong tường');
  } finally {
    room.stopLoop();
  }
});
