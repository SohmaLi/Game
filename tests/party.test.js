'use strict';

/**
 * Nhóm — luật mời, và chỗ hở mà giao diện vừa làm lộ ra.
 *
 * `server/party.js` đã chạy đủ từ lâu nhưng chưa từng có nút nào gọi tới, nên
 * chưa ai phát hiện: mất kết nối thì tên người thoát chỉ bị gỡ khỏi bộ nhớ, KHÔNG
 * ai báo cho những người còn lại. Không có bảng nhóm thì không nhìn thấy; có rồi
 * thì bảng treo tên một người đã đi khỏi bản đồ.
 */

const test = require('node:test');
const assert = require('node:assert');
const { PartyManager, MAX_PARTY, INVITE_TTL } = require('../server/party');

const player = (id, name = id) => ({ id, name, partyId: null });

/* ------------------------------------------------ luật mời ---------- */

test('mời rồi nhận thì cả hai vào chung một nhóm', () => {
  const pm = new PartyManager();
  const a = player('a');
  const b = player('b');

  assert.equal(pm.invite(a, b).ok, true);
  const res = pm.accept(b, a);

  assert.equal(res.ok, true);
  assert.equal(a.partyId, b.partyId);
  assert.deepEqual(pm.membersOf(a).sort(), ['a', 'b']);
});

test('không tự mời mình được', () => {
  const pm = new PartyManager();
  const a = player('a');
  assert.equal(pm.invite(a, a).ok, false);
});

test('người đang ở nhóm khác thì không mời được', () => {
  const pm = new PartyManager();
  const [a, b, c] = [player('a'), player('b'), player('c')];

  pm.invite(a, b);
  pm.accept(b, a);

  const res = pm.invite(c, b);
  assert.equal(res.ok, false);
  assert.match(res.error, /nhóm khác/);
});

test(`nhóm đủ ${MAX_PARTY} người thì không mời thêm`, () => {
  const pm = new PartyManager();
  const leader = player('L');

  for (let i = 1; i < MAX_PARTY; i++) {
    const m = player(`m${i}`);
    assert.equal(pm.invite(leader, m).ok, true, `mời người thứ ${i + 1}`);
    assert.equal(pm.accept(m, leader).ok, true);
  }
  assert.equal(pm.size(leader.partyId), MAX_PARTY);

  const res = pm.invite(leader, player('thua'));
  assert.equal(res.ok, false, 'người thứ 6 phải bị chặn ngay từ lúc mời');
});

test('lời mời quá hạn thì không nhận được nữa', () => {
  const pm = new PartyManager();
  const [a, b] = [player('a'), player('b')];

  pm.invite(a, b);
  // Kéo ngược thời điểm mời ra sau hạn — nhanh hơn là ngồi chờ 30 giây thật
  pm.invites.get('b|a').at = Date.now() - INVITE_TTL - 1;

  const res = pm.accept(b, a);
  assert.equal(res.ok, false);
  assert.equal(b.partyId, null);
});

test('nhận một lời mời không có thật thì bị từ chối', () => {
  const pm = new PartyManager();
  const [a, b] = [player('a'), player('b')];
  assert.equal(pm.accept(b, a).ok, false, 'không có lời mời nào mà vẫn vào được nhóm là lỗ hổng');
});

test('đi một mình thì "đồng đội" chỉ có chính mình', () => {
  const pm = new PartyManager();
  const a = player('a');
  assert.deepEqual(pm.membersOf(a), ['a'], 'trả về rỗng thì người đi một mình không vào trận nào được');
});

test('nhóm còn một người thì tan', () => {
  const pm = new PartyManager();
  const [a, b] = [player('a'), player('b')];
  pm.invite(a, b);
  pm.accept(b, a);

  const res = pm.leave(a);
  assert.equal(res.dissolved, true);
  assert.equal(res.orphan, 'b');
  assert.equal(pm.parties.size, 0, 'nhóm một người không còn là nhóm — giữ lại chỉ tổ rò bộ nhớ');
});

test('sweep dọn lời mời quá hạn, giữ lời mời còn sống', () => {
  const pm = new PartyManager();
  const [a, b, c] = [player('a'), player('b'), player('c')];

  pm.invite(a, b);
  pm.invite(a, c);
  pm.invites.get('b|a').at = Date.now() - INVITE_TTL - 1;

  pm.sweep();
  assert.equal(pm.invites.has('b|a'), false);
  assert.equal(pm.invites.has('c|a'), true);
});

/* ------------------------------------------- rời nhóm ở tầng phòng -- */

/** io ghi lại mọi thứ đã gửi, để kiểm tra người ở lại có được báo hay không. */
function recordingIo() {
  const sent = [];
  return {
    sent,
    to: (target) => ({ emit: (ev, data) => sent.push({ target, ev, data }) }),
    sockets: { sockets: new Map() },
  };
}

/** Phòng ở vùng an toàn: không quái, không Thủ Lĩnh, không gì nhiễu vào phép thử. */
function makeRoom() {
  const Room = require('../server/room');
  const zone = require('../server/data/zones').get('duskmoor');
  const io = recordingIo();
  const room = new Room('pve', io, zone);
  return { room, io };
}

/** Socket giả — `Room.add` chỉ cần id và một chỗ để gọi `join`. */
const joined = (room, id) => room.add({ id, join() {} }, id);

test('LỖI CŨ: mất kết nối thì người còn lại trong nhóm phải được báo', (t) => {
  const { room, io } = makeRoom();
  t.after(() => room.stopLoop());

  const a = joined(room, 'a');
  const b = joined(room, 'b');
  const c = joined(room, 'c');

  room.party.invite(a, b);
  room.party.accept(b, a);
  room.party.invite(a, c);
  room.party.accept(c, a);

  io.sent.length = 0;
  room.remove('c');   // rớt mạng, không bấm "Rời nhóm"

  const toB = io.sent.filter((s) => s.target === 'b' && s.ev === 'character');
  assert.equal(toB.length, 1, 'trước đây chỗ này ra 0 — bảng nhóm của B còn treo tên C');
  assert.deepEqual(toB[0].data.party.map((m) => m.id).sort(), ['a', 'b'],
    'danh sách gửi cho B không được còn C trong đó');

  assert.ok(io.sent.some((s) => s.ev === 'party:changed' && s.data.left === 'c'));
});

test('nhóm hai người tan khi một người rớt mạng — người ở lại hết cờ nhóm', (t) => {
  const { room } = makeRoom();
  t.after(() => room.stopLoop());

  const a = joined(room, 'a');
  const b = joined(room, 'b');
  room.party.invite(a, b);
  room.party.accept(b, a);

  room.remove('a');

  assert.equal(b.partyId, null,
    'còn trỏ tới một nhóm đã bị xoá thì lần mời sau hỏi sức chứa của cái không tồn tại');
  assert.deepEqual(room.characterState(b).party, []);
});

test('tự bấm rời nhóm và rớt mạng đi CHUNG một đường', (t) => {
  const { room, io } = makeRoom();
  t.after(() => room.stopLoop());

  const a = joined(room, 'a');
  const b = joined(room, 'b');
  const c = joined(room, 'c');
  room.party.invite(a, b);
  room.party.accept(b, a);
  room.party.invite(a, c);
  room.party.accept(c, a);

  io.sent.length = 0;
  room.dropFromParty(c);   // đúng hàm mà cả `party:leave` lẫn `remove` đều gọi

  assert.equal(c.partyId, null);
  assert.equal(io.sent.filter((s) => s.ev === 'character').length, 2, 'A và B đều phải được cập nhật');
});
