'use strict';

/**
 * Luật chạm quái — lý do người chơi kẹt cứng trên bản đồ hồi trước.
 *
 * Hai luật đánh nhau ở đây:
 *   1. Trận chỉ nổ khi quái VỪA chạm vào, không phải đang chạm.
 *   2. Ra khỏi trận thì được miễn va chạm vài giây.
 *
 * Ghép sai thì con quái đang đè lên người lúc hết miễn va chạm đã nằm sẵn trong
 * `contacts` — không còn "vừa chạm", và người chơi đứng trong bụng nó mãi mà
 * không trận nào nổ ra.
 */

const test = require('node:test');
const assert = require('node:assert');
const cfg = require('../server/config');

/** Bản rút gọn của Room.checkEncounters, đúng luật, không cần dựng cả phòng. */
function makeRoom() {
  const Room = require('../server/room');
  const zone = require('../server/data/zones').get('meadow');
  const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };
  const room = new Room('pve', io, zone);
  room.startBattle = function (group, p) { this.started.push({ p: p.id, n: group.length }); return null; };
  room.engageBoss = function (b, p) { this.started.push({ p: p.id, boss: true }); return null; };
  room.started = [];
  return room;
}

function addPlayer(room, x, y) {
  const p = {
    id: 's1', name: 'Thử', x, y, battleId: null, graceUntil: 0,
    contacts: new Set(), input: {},
  };
  room.players.set(p.id, p);
  return p;
}

/** Con quái đứng im tại chỗ, đã hết miễn va chạm. */
function mobAt(room, x, y) {
  const m = {
    id: `m${room.roamers.size + 1}`, x, y, radius: cfg.ROAMER.radius,
    boss: false, get immune() { return false; },
  };
  room.roamers.set(m.id, m);
  return m;
}

test('quái vừa chạm vào thì nổ ra trận', () => {
  const room = makeRoom();
  const p = addPlayer(room, 100, 100);
  mobAt(room, 100, 100);

  room.checkEncounters(Date.now(), [p]);
  assert.equal(room.started.length, 1);
});

test('đứng yên trong quái thì KHÔNG nổ trận lần hai', () => {
  const room = makeRoom();
  const p = addPlayer(room, 100, 100);
  mobAt(room, 100, 100);

  room.checkEncounters(Date.now(), [p]);
  room.checkEncounters(Date.now(), [p]);
  room.checkEncounters(Date.now(), [p]);
  assert.equal(room.started.length, 1, 'đang chạm không được tính là vừa chạm');
});

test('đang miễn va chạm thì không nổ trận, và KHÔNG ghi tiếp xúc', () => {
  const room = makeRoom();
  const p = addPlayer(room, 100, 100);
  mobAt(room, 100, 100);
  const now = Date.now();
  p.graceUntil = now + cfg.ROAMER.graceMs;

  // vài tick trong lúc còn miễn — con quái đè ngay lên người
  for (let i = 0; i < 5; i++) room.checkEncounters(now + i * 100, [p]);

  assert.equal(room.started.length, 0, 'còn miễn thì không được kéo vào trận');
  assert.equal(p.contacts.size, 0, 'không được ghi tiếp xúc trong lúc miễn');
});

test('LỖI CŨ: hết miễn va chạm mà quái vẫn đè lên người thì phải nổ trận', () => {
  const room = makeRoom();
  const p = addPlayer(room, 100, 100);
  mobAt(room, 100, 100);
  const now = Date.now();
  p.graceUntil = now + cfg.ROAMER.graceMs;

  for (let i = 0; i < 5; i++) room.checkEncounters(now + i * 100, [p]);
  assert.equal(room.started.length, 0);

  // hết miễn, con quái không hề nhúc nhích
  room.checkEncounters(now + cfg.ROAMER.graceMs + 1, [p]);

  assert.equal(room.started.length, 1,
    'trước đây chỗ này ra 0 — người chơi kẹt trong bụng quái, không đi được, không vào trận được');
});

test('đang trong trận thì không nổ thêm trận nào', () => {
  const room = makeRoom();
  const p = addPlayer(room, 100, 100);
  mobAt(room, 100, 100);
  p.battleId = 'b1';

  room.checkEncounters(Date.now(), [p]);
  assert.equal(room.started.length, 0);
});

test('quái đứng xa thì không chạm tới', () => {
  const room = makeRoom();
  const p = addPlayer(room, 100, 100);
  mobAt(room, 400, 400);

  room.checkEncounters(Date.now(), [p]);
  assert.equal(room.started.length, 0);
});
