'use strict';

/**
 * Cấp đồ bám theo NGƯỜI CHƠI, phẩm chất bám theo BẢN ĐỒ.
 *
 * Trước đây cả hai đều bám theo con quái vừa hạ, nên một người cấp 60 đi ngang
 * Đồng Cỏ chỉ nhặt được đồ cấp 5 — nhặt lên chỉ để vứt, và cả vùng đó thành chỗ
 * chết. Và cùng lúc đó, phẩm chất ở vùng dễ với vùng khó y hệt nhau: đứng chỗ
 * an toàn cày lâu cũng ra Truyền Thuyết.
 */

const test = require('node:test');
const assert = require('node:assert');

const loot = require('../server/loot');
const items = require('../server/data/items');
const zones = require('../server/data/zones');
const inventory = require('../server/inventory');

const RUNS = 40000;

/* ------------------------------------------------ cấp món đồ ---------- */

test('cấp món đồ theo cấp NGƯỜI NHẬN, không theo con quái', () => {
  const killed = [{ id: 'grey_wolf', level: 3 }];
  const roll = loot.rollBattleLoot(killed, { luck: 99, playerLevel: 58 });

  assert.ok(roll.drops.length, 'luck 99 thì chắc chắn rơi');
  for (const d of roll.drops) {
    assert.equal(d.level, 58, 'nhặt đồ cấp 3 ở cấp 58 là nhặt lên chỉ để vứt');
  }
});

test('không truyền cấp người chơi thì quay về cấp quái — không sinh ra đồ cấp 0', () => {
  const roll = loot.rollBattleLoot([{ id: 'grey_wolf', level: 7 }], { luck: 99 });
  for (const d of roll.drops) assert.equal(d.level, 7);
});

test('kinh nghiệm và vàng VẪN theo con quái — không thì Đồng Cỏ nuôi được cấp 60', () => {
  const low = loot.rollBattleLoot([{ id: 'grey_wolf', level: 3 }], { playerLevel: 60 });
  const high = loot.rollBattleLoot([{ id: 'grey_wolf', level: 55 }], { playerLevel: 60 });
  assert.ok(high.exp > low.exp * 5);
  assert.ok(high.gold > low.gold * 5);
});

/* ------------------------------------------------ phẩm chất ---------- */

function rarityShare(quality, runs = RUNS) {
  const count = {};
  for (let i = 0; i < runs; i++) {
    const r = items.rollRarity(1, Math.random, quality);
    count[r] = (count[r] || 0) + 1;
  }
  const share = {};
  for (const r of items.RARITY_ORDER) share[r] = (count[r] || 0) / runs;
  return share;
}

test('mọi vùng săn quái đều khai độ khó, và tăng dần đúng thứ tự cấp', () => {
  const wild = zones.ZONES.filter((z) => !z.safe);
  const seen = wild.map((z) => z.difficulty);

  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'vùng cấp cao hơn phải khó hơn');
  assert.equal(new Set(seen).size, seen.length, 'hai vùng cùng độ khó thì cái sau vô nghĩa');
  for (const z of wild) assert.ok(z.difficulty >= 1);
});

test('vùng dễ nhất không được cộng gì — nó là mốc so sánh', () => {
  assert.equal(zones.qualityOf(zones.get('meadow')), 1);
});

test('vùng càng khó, hệ số phẩm chất càng cao', () => {
  const wild = zones.ZONES.filter((z) => !z.safe).map((z) => zones.qualityOf(z));
  for (let i = 1; i < wild.length; i++) assert.ok(wild[i] > wild[i - 1]);
});

test('đo thật: hạng cao rơi nhiều hơn hẳn ở vùng khó', () => {
  const easy = rarityShare(zones.qualityOf(zones.get('meadow')));
  const hard = rarityShare(zones.qualityOf(zones.get('voidshrine')));

  assert.ok(hard.rare > easy.rare * 2, `Hiếm: ${(easy.rare * 100).toFixed(1)}% → ${(hard.rare * 100).toFixed(1)}%`);
  assert.ok(hard.epic > easy.epic * 2, `Sử Thi: ${(easy.epic * 100).toFixed(1)}% → ${(hard.epic * 100).toFixed(1)}%`);
  assert.ok(hard.legendary > easy.legendary, 'Truyền Thuyết cũng phải nhích lên');
  assert.ok(hard.common < easy.common, 'phần bù phải lấy từ hạng Thường');
});

test('Truyền Thuyết vẫn hiếm kể cả ở vùng khó nhất — không được thành thứ nhặt hàng ngày', () => {
  const hard = rarityShare(zones.qualityOf(zones.get('voidshrine')));
  assert.ok(hard.legendary < 0.03, `đo được ${(hard.legendary * 100).toFixed(2)}%`);
});

test('Duyên Kho Báu vẫn cộng thêm ở trên hệ số vùng, không bị nuốt', () => {
  const q = zones.qualityOf(zones.get('voidshrine'));
  const plain = rarityShare(q);
  const lucky = (() => {
    const count = {};
    for (let i = 0; i < RUNS; i++) {
      const r = items.rollRarity(1.5, Math.random, q);
      count[r] = (count[r] || 0) + 1;
    }
    return { epic: (count.epic || 0) / RUNS };
  })();

  assert.ok(lucky.epic > plain.epic,
    'Đặc Ân mất giá đúng ở nơi người chơi cần nó nhất là hỏng cả Đặc Ân đó');
});

test('hàng của thương nhân KHÔNG ăn theo phẩm chất vùng — nó ép hạng sẵn', () => {
  // shop.rollStock luôn truyền `rarity`, và `rarity` ép thì `quality` không được xen vào
  const it = items.generate(30, { rarity: 'common', quality: 99 });
  assert.equal(it.rarity, 'common');
});

/* ------------------------------------------------ bị động ------------ */

test('bảng bị động gọi TÊN thứ mà con số cộng vào, không để người chơi tự đoán', () => {
  const inv = inventory.create();
  inv.equipped.chest = {
    name: 'Giáp Tấm Hiếm',
    passives: [{ name: 'Gai Nhọn', desc: 'Dội lại 6% sát thương nhận vào', effect: { reflect: 0.06 } }],
  };

  const [p] = inventory.activePassives(inv);
  assert.equal(p.value, '+6%');
  assert.match(p.effect, /sát thương dội lại/,
    '"+6%" trần trụi thì phải rê chuột mới biết 6% của cái gì — đúng thứ bảng tổng hợp sinh ra để tránh');
});

test('nhiều món cùng bị động thì cộng dồn, và con số trong dòng là TỔNG', () => {
  const inv = inventory.create();
  const thorns = { name: 'Gai Nhọn', desc: 'x', effect: { reflect: 0.06 } };
  inv.equipped.chest = { name: 'Giáp', passives: [thorns] };
  inv.equipped.head = { name: 'Mũ', passives: [thorns] };

  const [p] = inventory.activePassives(inv);
  assert.equal(p.stacks, 2);
  assert.equal(p.value, '+12%');
  assert.equal(p.sources.length, 2, 'phải nói rõ nó đến từ hai món nào');
});

test('mana hồi là số nguyên, không bị nhân 100 thành phần trăm', () => {
  const inv = inventory.create();
  inv.equipped.head = {
    name: 'Mũ', passives: [{ name: 'Suối Mana', desc: 'x', effect: { manaRegen: 3 } }],
  };
  const [p] = inventory.activePassives(inv);
  assert.equal(p.value, '+3');
  assert.match(p.effect, /mana hồi mỗi vòng/);
});

test('mọi bị động trong data/items.js đều có tên tiếng Việt cho hiệu ứng của nó', () => {
  const inv = inventory.create();
  for (const p of items.PASSIVES) {
    inv.equipped.chest = { name: 'X', passives: [{ ...p, desc: 'x' }] };
    const [out] = inventory.activePassives(inv);
    for (const key of Object.keys(p.effect)) {
      assert.ok(!out.effect.includes(key),
        `"${key}" chưa có tên tiếng Việt — dòng bị động sẽ hiện nguyên tên biến`);
    }
  }
});
