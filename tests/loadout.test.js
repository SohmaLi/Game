'use strict';

/**
 * Bộ kỹ năng mang vào trận.
 *
 * Lỗi thật ngoài production: nhân vật "Link" có 4 chiêu chủ động xanh lè trong
 * Cây Nền nhưng `carried` là `[]` — vào trận chỉ có Đánh Thường và Phòng Thủ,
 * và không có gì trên màn hình nói cho người chơi biết vì sao.
 */

const test = require('node:test');
const assert = require('node:assert');

const Room = require('../server/room');
const zones = require('../server/data/zones');
const skillData = require('../server/data/skills');

function makeRoom() {
  const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };
  return new Room('pve', io, zones.get('meadow'));
}

/** Bản ghi nhân vật như `characters.present()` trả về. */
function character(over = {}) {
  return {
    id: 6, name: 'Link', class: 'warrior', level: 8, exp: 0, gold: 0,
    stats: { str: 8, int: 5, vit: 8, agi: 6, wil: 5, points: 0 },
    learned: ['heavy_slash', 'w_tough', 'iron_skin', 'whirlwind', 'taunt', 'w_rageflow'],
    carried: [],
    codex: null, books: [], equipped: null, bag: [], pos: { x: 0, y: 0 },
    nation: null, boon: null,
    ...over,
  };
}

/** Vòng lặp game giữ tiến trình sống mãi — test phải tắt nó đi. */
const join = (room, char) => {
  const p = room.add({ id: 's1', join() {} }, 'Link', char);
  room.stopLoop();
  return p;
};

test('bộ mang theo RỖNG thì tự điền lại từ những chiêu đã mở', () => {
  const p = join(makeRoom(), character());
  assert.deepEqual(p.carried, ['heavy_slash', 'iron_skin', 'whirlwind', 'taunt'],
    'trước đây chỗ này ra [] — người chơi cộng hết điểm mà vào trận không dùng được chiêu nào');
});

test('LỖI CŨ: bộ mang theo rỗng thì vào trận chỉ còn hai chiêu bẩm sinh', () => {
  // Tái hiện đúng trạng thái hỏng: không đi qua bước tự điền
  const loadout = skillData.loadoutFor('warrior', [], ['heavy_slash', 'whirlwind']);
  assert.deepEqual(loadout, ['attack', 'defend']);
});

test('đã tự chọn bớt chiêu thì KHÔNG nhét lại — đó là lựa chọn thật', () => {
  const p = join(makeRoom(), character({ carried: ['heavy_slash'] }));
  assert.deepEqual(p.carried, ['heavy_slash'],
    'chỉ điền khi rỗng; bỏ bớt chiêu để chừa chỗ là quyền của người chơi');
});

test('chưa chọn lớp thì không có gì để điền', () => {
  const p = join(makeRoom(), character({ class: null, learned: [] }));
  assert.deepEqual(p.carried, []);
});

test('không bao giờ điền quá số ô cho phép', () => {
  const many = Array.from({ length: 30 }, (_, i) => `x${i}`);
  const p = join(makeRoom(), character({ learned: [...many, 'heavy_slash', 'whirlwind'] }));
  assert.ok(p.carried.length <= skillData.MAX_LOADOUT);
  assert.deepEqual(p.carried, ['heavy_slash', 'whirlwind'], 'nút không có thật thì bỏ qua');
});

test('chiêu Dị Điển đã gắn cũng được mang vào trận', () => {
  const codex = Array(10).fill(null);
  codex[0] = { uid: 'bk1', skillId: 'd_venom', name: 'Dị Điển: Nọc Độc', from: 'Nhện' };
  const p = join(makeRoom(), character({ codex }));
  assert.ok(p.carried.includes('d_venom'),
    'gắn sách xong mà chiêu vẫn nằm ngoài trận thì gắn để làm gì');
});
