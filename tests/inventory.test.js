'use strict';

/**
 * Túi đồ — nhất là xoá hàng loạt.
 *
 * Xoá đồ là thao tác KHÔNG HOÀN TÁC được. Mỗi luật ở đây từng là một cách làm
 * mất đồ của người chơi, nên đừng bỏ test nào đi cho gọn.
 */

const test = require('node:test');
const assert = require('node:assert');
const inventory = require('../server/inventory');

function bagWith(...items) {
  const inv = inventory.create();
  inv.bag.push(...items);
  return inv;
}

const item = (uid, rarity = 'common') => ({ uid, name: `Món ${uid}`, rarity });

test('xoá nhiều món bỏ đúng những món được chọn', () => {
  const inv = bagWith(item('a'), item('b'), item('c'));
  const res = inventory.discardMany(inv, ['a', 'c']);

  assert.equal(res.ok, true);
  assert.deepEqual(res.removed.map((i) => i.uid), ['a', 'c']);
  assert.deepEqual(inv.bag.map((i) => i.uid), ['b']);
});

test('uid không tồn tại lẫn vào thì bỏ qua, không làm hỏng cả lượt xoá', () => {
  const inv = bagWith(item('a'), item('b'));
  const res = inventory.discardMany(inv, ['a', 'khong-co-that']);

  assert.equal(res.ok, true);
  // Báo về đúng MỘT món đã xoá — client đếm theo danh sách gửi đi là báo sai
  assert.equal(res.removed.length, 1);
  assert.deepEqual(inv.bag.map((i) => i.uid), ['b']);
});

test('KHÔNG BAO GIỜ đụng tới đồ đang mặc', () => {
  const inv = bagWith(item('a'));
  inv.equipped.weapon = item('vukhi', 'legendary');

  const res = inventory.discardMany(inv, ['vukhi']);

  assert.equal(res.ok, false);
  assert.equal(inv.equipped.weapon.uid, 'vukhi');
});

test('danh sách rỗng hoặc dữ liệu rác thì từ chối, không xoá gì', () => {
  const inv = bagWith(item('a'), item('b'));

  for (const bad of [[], null, undefined, 'a', { uid: 'a' }, 123]) {
    const res = inventory.discardMany(inv, bad);
    assert.equal(res.ok, false, `phải từ chối: ${JSON.stringify(bad)}`);
  }
  assert.equal(inv.bag.length, 2);
});

test('xoá một món vẫn chạy như cũ', () => {
  const inv = bagWith(item('a'), item('b'));
  assert.equal(inventory.discard(inv, 'a'), true);
  assert.equal(inventory.discard(inv, 'a'), false); // xoá lần hai thì báo không thấy
  assert.deepEqual(inv.bag.map((i) => i.uid), ['b']);
});
