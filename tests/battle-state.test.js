'use strict';

/**
 * Số thứ tự gói trạng thái — thứ giữ cho màn chiến đấu không đứng hình.
 *
 * Client phát hoạt cảnh mất hơn một giây rồi mới áp trạng thái kèm theo. Vòng
 * mới thường xuyên tới trước lúc đó (chiêu quét cả nhóm hạ nhiều con cùng lúc
 * là đủ), và nếu không phân biệt được gói nào mới hơn thì client ghi đè trạng
 * thái mới bằng trạng thái cũ: thanh 20 giây đứng im, nút kỹ năng khoá cứng,
 * còn server vẫn đếm ngược rồi tự đánh thay.
 */

const test = require('node:test');
const assert = require('node:assert');

const { Battle, RESOLVE_MS } = require('../server/battle');
const monsters = require('../server/data/monsters');

function makeBattle() {
  const io = { to: () => ({ emit() {} }) };
  return new Battle({
    allies: [{
      id: 'p1', socketId: 'p1', name: 'Thử', level: 12, className: 'mage',
      stats: { str: 5, int: 20, vit: 10, agi: 8, wil: 10 },
      carried: ['meteor'], unlocked: ['meteor'], rage: 0, karma: 0,
    }],
    monsterDefs: [monsters.scaled(monsters.randomCommon(), 12)],
    io, channel: 'c', onEnd() {}, onLeave() {}, auto: false,
  });
}

test('mỗi gói trạng thái mang một số thứ tự LỚN DẦN', () => {
  const b = makeBattle();
  const seqs = [b.serialize().seq, b.serialize().seq, b.serialize().seq];
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y));
  assert.equal(new Set(seqs).size, 3, 'trùng số là client không phân biệt được gói nào mới hơn');
  b.destroy();
});

test('gói kèm theo battle:resolve luôn CŨ hơn gói của vòng sau', () => {
  const b = makeBattle();
  b.submit('p1', 'meteor', b.living('enemy')[0].id);
  const duringResolve = b.serialize().seq;   // gói client phát hoạt cảnh xong mới áp
  const nextRound = b.serialize().seq;       // gói vòng mới, tới trong lúc đang phát
  assert.ok(nextRound > duringResolve,
    'client dựa vào đúng dấu này để bỏ qua gói cũ thay vì ghi đè lên gói mới');
  b.destroy();
});

test('client biết mình có bao nhiêu thời gian để phát hoạt cảnh', () => {
  const b = makeBattle();
  assert.equal(b.serialize().resolveMs, RESOLVE_MS,
    'thiếu con số này thì client phải đoán, và đoán sai là hoạt cảnh bị vòng sau cắt ngang');
  b.destroy();
});
