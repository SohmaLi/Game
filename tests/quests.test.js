'use strict';

/**
 * Nhật Ký nhiệm vụ (DESIGN.md §8b).
 *
 * Lỗ hổng nó lấp: vào game là đứng giữa đồng cỏ, không mục tiêu, không ai giao
 * việc. Mọi thứ khác trong game đều là cơ chế — đánh, nhặt, cộng điểm — nhưng
 * không có gì trả lời câu "giờ tôi nên làm gì".
 */

const test = require('node:test');
const assert = require('node:assert');

const quests = require('../server/quests');
const questData = require('../server/data/quests');
const zones = require('../server/data/zones');
const monsterData = require('../server/data/monsters');
const itemData = require('../server/data/items');
const tree = require('../server/data/skilltree');

const hero = (over = {}) => ({
  id: 'p1', name: 'Link', characterId: 6,
  level: 28, gold: 0, exp: 0,
  codex: Array(tree.CODEX_SLOTS).fill(null),
  inv: { equipped: {}, bag: [] },
  books: [], quests: null,
  ...over,
});

const kills = (n, id, tier = 'common') =>
  Array.from({ length: n }, () => ({ id, tier }));

/* ------------------------------------------------ dữ liệu ------------- */

test('mọi vùng săn quái đều có đủ ba việc, và trỏ tới quái có thật', () => {
  const wild = zones.ZONES.filter((z) => !z.safe);
  assert.equal(questData.ZONE_QUESTS.length, wild.length * 3);

  for (const q of questData.ZONE_QUESTS) {
    assert.ok(zones.get(q.zone), `${q.id} trỏ tới vùng không có thật`);
    assert.ok(q.name && q.desc, `${q.id} thiếu tên hoặc lời dẫn`);
    if (q.goal.type === 'kill') {
      assert.ok(monsterData.get(q.goal.monster), `${q.id} đòi hạ "${q.goal.monster}" không tồn tại`);
    }
    assert.ok(q.reward.gold > 0);
  }
});

test('việc vùng cấp cao thưởng nhiều hơn hẳn việc vùng cấp thấp', () => {
  const meadow = questData.ZONE_QUESTS.find((q) => q.id === 'meadow_clear');
  const void_ = questData.ZONE_QUESTS.find((q) => q.id === 'voidshrine_clear');
  assert.ok(void_.reward.gold > meadow.reward.gold * 4);
  assert.ok(void_.reward.exp > meadow.reward.exp * 4);
});

test('mọi cột mốc đều có mục tiêu mà bộ máy biết đọc', () => {
  const KNOWN = ['kill', 'tier', 'level', 'codex', 'equip'];
  assert.ok(questData.MILESTONES.length >= 6);
  for (const m of questData.MILESTONES) {
    assert.ok(KNOWN.includes(m.goal.type), `"${m.id}" khai mục tiêu "${m.goal.type}" không ai đọc được`);
  }
});

test('mọi khuôn việc hàng ngày đều có chỗ thay {count} trong lời dẫn', () => {
  for (const t of questData.DAILY_TEMPLATES) {
    assert.match(t.desc, /\{count\}/, `"${t.id}" ghi cứng con số thì co giãn theo cấp xong lời dẫn nói sai`);
  }
});

/* ------------------------------------------------ bộ đếm -------------- */

test('hạ quái thì cộng cả khoá theo bản mẫu lẫn khoá theo hạng', () => {
  const p = hero();
  quests.recordKills(p, [{ id: 'grey_wolf', tier: 'common' }, { id: 'cliff_bear', tier: 'elite' }]);

  const c = p.quests.counters;
  assert.equal(c[quests.killKey('grey_wolf')], 1);
  assert.equal(c[quests.tierKey('common')], 1);
  assert.equal(c[quests.tierKey('elite')], 1);
  assert.equal(c[quests.tierKey('any')], 2, '"any" phải đếm mọi con, bất kể hạng');
});

test('bản lưu cũ chưa có cột quests thì đọc ra bảng rỗng, không nổ', () => {
  for (const bad of [null, undefined, 'rác', 42, []]) {
    const q = quests.normalize(bad);
    assert.deepEqual(q.counters, {});
    assert.deepEqual(q.claimed, []);
  }
});

test('tiến độ đọc thẳng từ nhân vật với những thứ không phải bộ đếm', () => {
  const p = hero({ level: 34 });
  p.codex[0] = { skillId: 'd_venom' };
  p.codex[3] = { skillId: 'd_howl' };
  p.inv.equipped.chest = { name: 'X' };

  assert.deepEqual(quests.progressOf(p, { type: 'level', level: 40 }), { have: 34, need: 40 });
  assert.deepEqual(quests.progressOf(p, { type: 'codex', slots: 5 }), { have: 2, need: 5 });
  assert.deepEqual(quests.progressOf(p, { type: 'equip', slots: 10 }), { have: 1, need: 10 });
});

test('mặc kín cả 10 ô thì cột mốc "Đủ bộ" xong', () => {
  const p = hero();
  for (const s of itemData.SLOT_IDS) p.inv.equipped[s] = { name: 'X' };
  const view = quests.stateFor(p).milestones.find((m) => m.id === 'm_equip');
  assert.equal(view.claimable, true);
});

/* ------------------------------------------------ việc hàng ngày ------ */

test('mỗi ngày đúng 3 việc — không phải 2', () => {
  // Bể có 4 khuôn; bốc 3 bằng splice mà để `pool.length` trong điều kiện lặp
  // thì chỉ ra 2, vì độ dài teo đi sau mỗi lần bốc
  const s = quests.stateFor(hero());
  assert.equal(s.dailies.length, 3);
  assert.equal(new Set(s.dailies.map((d) => d.id)).size, 3, 'không được bốc trùng khuôn');
});

test('cùng một nhân vật, cùng một ngày thì luôn ra đúng bộ việc đó', () => {
  const now = Date.UTC(2026, 7, 20, 9, 0, 0);
  const a = quests.stateFor(hero(), now).dailies.map((d) => d.id);
  const b = quests.stateFor(hero(), now).dailies.map((d) => d.id);
  assert.deepEqual(a, b, 'không cố định thì thoát ra vào lại là quay xổ số tới lúc vừa ý');
});

test('sang ngày mới thì đổi bộ việc và chụp lại mốc nền', () => {
  const day1 = Date.UTC(2026, 7, 20, 9, 0, 0);
  const day2 = day1 + quests.DAY_MS;

  const p = hero();
  quests.stateFor(p, day1);
  quests.recordKills(p, kills(100, 'grey_wolf'));
  quests.stateFor(p, day2);

  assert.equal(p.quests.dailyBase[quests.tierKey('any')], 100,
    'không chụp mốc nền thì một nhân vật đã hạ 4000 con thấy cả ba việc hôm nay xong sẵn lúc đăng nhập');
});

test('tiến độ việc hàng ngày đếm từ mốc nền, không đếm cả đời', () => {
  const day1 = Date.UTC(2026, 7, 20, 9, 0, 0);
  const p = hero();

  quests.recordKills(p, kills(500, 'grey_wolf'));   // cả đời trước hôm nay
  quests.stateFor(p, day1);                          // chụp mốc nền

  const before = quests.stateFor(p, day1).dailies;
  assert.ok(before.every((d) => d.have === 0), 'ngày mới thì mọi việc phải bắt đầu từ 0');

  quests.recordKills(p, kills(10, 'grey_wolf'));
  const after = quests.stateFor(p, day1).dailies.find((d) => d.id === 'd_hunt' || d.id === 'd_clear');
  if (after) assert.equal(after.have, 10);
});

test('mốc việc hàng ngày co giãn theo cấp — cấp trần không xong trong hai phút', () => {
  const tpl = questData.DAILY_TEMPLATES.find((t) => t.id === 'd_clear');
  assert.ok(quests.dailyGoal(tpl, 60).count > quests.dailyGoal(tpl, 1).count);
  assert.equal(quests.dailyGoal(tpl, 1).count, tpl.goal.count);
});

/* ------------------------------------------------ nhận thưởng --------- */

test('làm xong việc vùng thì nhận được vàng và kinh nghiệm', () => {
  const p = hero({ level: 10 });
  quests.recordKills(p, kills(questData.CLEAR_COUNT, 'grey_wolf'));

  const res = quests.claim(p, 'meadow_clear');

  assert.equal(res.ok, true);
  assert.equal(p.gold, res.gold);
  assert.ok(res.gold > 0 && res.exp > 0);
});

test('chưa xong thì không nhận được, và câu từ chối nói rõ còn thiếu bao nhiêu', () => {
  const p = hero();
  quests.recordKills(p, kills(5, 'grey_wolf'));

  const res = quests.claim(p, 'meadow_clear');
  assert.equal(res.ok, false);
  assert.match(res.error, /5\/20/);
  assert.equal(p.gold, 0);
});

test('không nhận thưởng hai lần cho cùng một việc', () => {
  const p = hero({ level: 10 });
  quests.recordKills(p, kills(questData.CLEAR_COUNT, 'grey_wolf'));

  const first = quests.claim(p, 'meadow_clear');
  const gold = p.gold;
  const second = quests.claim(p, 'meadow_clear');

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(p.gold, gold, 'nhận lại lần hai mà vẫn cộng vàng là một cỗ máy in vàng');
});

test('gửi id bịa ra thì bị từ chối, không nổ và không mất gì', () => {
  const p = hero();
  const res = quests.claim(p, 'khong-co-that');
  assert.equal(res.ok, false);
  assert.equal(p.gold, 0);
});

test('việc Thủ Lĩnh trả thêm một cuốn Dị Điển thật, vào đúng kho sách', () => {
  const p = hero({ level: 10 });
  quests.recordKills(p, [{ id: 'alpha_wolf', tier: 'boss' }]);

  const res = quests.claim(p, 'meadow_boss');

  assert.equal(res.ok, true);
  assert.ok(res.book, 'Thủ Lĩnh 5 phút mới có một con — vàng không thôi thì không đáng');
  assert.equal(p.books.length, 1);
  assert.ok(p.books[0].skillId, 'sách phải mang kỹ năng thật, không phải vỏ rỗng');
  assert.equal(p.books[0].tier, 'boss');
});

test('nhận thưởng việc hàng ngày rồi thì hôm nay hết, nhưng mai lại có', () => {
  const day1 = Date.UTC(2026, 7, 20, 9, 0, 0);
  const p = hero();
  const id = quests.stateFor(p, day1).dailies[0].id;
  const goal = quests.dailyGoal(questData.daily(id), p.level);

  // Nhồi đủ mọi loại để chắc chắn việc nào cũng xong
  quests.recordKills(p, kills(goal.count + 5, 'grey_wolf', goal.tier === 'any' ? 'common' : goal.tier));

  assert.equal(quests.claim(p, id, day1).ok, true);
  assert.equal(quests.claim(p, id, day1).ok, false);

  quests.stateFor(p, day1 + quests.DAY_MS);
  assert.deepEqual(p.quests.dailyClaimed, [], 'sang ngày mới phải xoá sổ đã nhận, không thì mai không làm được gì');
});

test('thưởng việc vùng tính theo cấp TRẦN VÙNG, không theo cấp người chơi', () => {
  const rich = hero({ level: 60 });
  const poor = hero({ level: 10 });
  quests.recordKills(rich, kills(questData.CLEAR_COUNT, 'grey_wolf'));
  quests.recordKills(poor, kills(questData.CLEAR_COUNT, 'grey_wolf'));

  const a = quests.claim(rich, 'meadow_clear');
  const b = quests.claim(poor, 'meadow_clear');

  assert.equal(a.exp, b.exp,
    'theo cấp người chơi thì cấp 60 quay về Đồng Cỏ là đường tắt lên cấp nhanh nhất game');
});

/* ------------------------------------------------ gửi client --------- */

test('chấm đỏ chỉ đếm việc BẤM ĐƯỢC, không đếm việc đang làm dở', () => {
  const p = hero({ level: 1 });
  const s0 = quests.stateFor(p);
  assert.equal(s0.claimable, 0, 'nhân vật cấp 1 chưa làm gì thì không có gì để nhận');

  quests.recordKills(p, kills(questData.CLEAR_COUNT, 'grey_wolf'));
  assert.equal(quests.stateFor(p).claimable, 1);
});

test('lời dẫn việc hàng ngày thay {count} bằng con số đã co giãn', () => {
  const d = quests.stateFor(hero({ level: 60 })).dailies[0];
  assert.ok(!d.desc.includes('{count}'), 'quên thay thì người chơi đọc thấy nguyên cái dấu ngoặc');
  assert.ok(d.desc.includes(String(d.need)));
});

test('Nhật Ký tính lại mỗi lần gửi, không cache — bộ đếm đổi sau mỗi trận', () => {
  const p = hero({ level: 10 });
  assert.equal(quests.stateFor(p).zones.find((z) => z.id === 'meadow_clear').have, 0);
  quests.recordKills(p, kills(7, 'grey_wolf'));
  assert.equal(quests.stateFor(p).zones.find((z) => z.id === 'meadow_clear').have, 7);
});

/* ------------------------------------------------ dây chuyền thật ---- */

/**
 * Chỗ dễ đứt nhất không nằm trong `quests.js` mà ở đoạn nối:
 * `battle.finish` dựng `killed` → `rewards` mang nó về → `Room.applyRewards`
 * gọi `recordKills`. Ba mắt xích ở ba file, và không mắt nào tự báo khi đứt.
 */
const Room = require('../server/room');

const makeRoom = () => new Room('pve', { to: () => ({ emit() {} }), sockets: { sockets: new Map() } }, zones.get('meadow'));

const addHero = (room, level = 40) => room.add({ id: 's1', join() {} }, 'Link', {
  id: 9, name: 'Link', class: 'warrior', level, exp: 0, gold: 0,
  stats: { str: 60, int: 5, vit: 60, agi: 20, wil: 5, points: 0 },
  learned: [], carried: [], codex: null, books: [], equipped: null, bag: [],
  pos: { x: 0, y: 0 }, nation: null, boon: null, skillRanks: {},
});

test('một trận THẬT thắng thì bộ đếm nhiệm vụ nhích lên', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  const p = addHero(room);

  // Trận dựng bằng chính `startBattle` từ quái THẬT trên bản đồ, không phải đồ
  // giả: chỗ dễ hỏng nhất là sợi dây nối ba file, mà đồ giả thì đi vòng qua nó.
  //
  // Lọc đúng Sói Xám chứ không lấy hai con đầu danh sách: việc vùng đầu tiên
  // của Đồng Cỏ chỉ đếm Sói Xám, nên bốc trúng hai con Cướp Đường là test đỏ
  // vì một lý do chẳng liên quan gì tới thứ nó đang kiểm.
  const wolf = zones.get('meadow').monsters[0];
  const mobs = [...room.roamers.values()].filter((r) => r.def.id === wolf).slice(0, 2);
  assert.ok(mobs.length, `bản đồ Đồng Cỏ không có con ${wolf} nào — đổi lại dữ liệu vùng?`);
  const ids = mobs.map((m) => m.def.id);
  const battle = room.startBattle(mobs, p);
  assert.ok(battle, 'không dựng được trận thì phần còn lại của test vô nghĩa');

  battle.finish('win');

  for (const id of new Set(ids)) {
    const want = ids.filter((x) => x === id).length;
    assert.equal(p.quests.counters[quests.killKey(id)], want,
      'ba mắt xích ở ba file — đứt mắt nào thì bộ đếm đứng im mà không ai báo');
  }
  assert.equal(p.quests.counters[quests.tierKey('any')], ids.length);

  // Và Nhật Ký gửi cho client phải phản ánh ngay, không chờ đăng nhập lại
  const q = room.characterState(p).quests;
  assert.equal(q.zones.find((z) => z.id === 'meadow_clear').have, mobs.length);
});

test('thua trận thì KHÔNG cộng bộ đếm — không thì lao vào chết cũng xong nhiệm vụ', (t) => {
  const room = makeRoom();
  t.after(() => room.stopLoop());
  const p = addHero(room, 5);

  const mobs = [...room.roamers.values()].filter((r) => !r.elite && !r.boss).slice(0, 1);
  const battle = room.startBattle(mobs, p);
  battle.finish('lose');

  assert.equal(p.quests.counters[quests.tierKey('any')], undefined);
});
