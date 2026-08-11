'use strict';

/**
 * Bảng hình phải phủ hết dữ liệu game.
 *
 * `public/img/atlas.json` do `tools/build-sprites.js` sinh ra từ một bảng viết
 * tay. Thêm một con quái hay một vùng mới mà quên cập nhật bảng đó thì game
 * không sập — nó lặng lẽ vẽ lại hình tròn màu như thời chưa có sprite, và rất
 * dễ tưởng là do trình duyệt chưa tải xong ảnh.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'atlas.json'), 'utf8'));
const monsters = require('../server/data/monsters');
const zones = require('../server/data/zones');
const classes = require('../server/data/classes');

test('mọi con quái đều có hình', () => {
  const thiếu = monsters.MONSTERS.map((m) => m.id).filter((id) => !atlas.mobs[id]);
  assert.deepEqual(thiếu, [], 'thiếu hình thì con quái đó lặng lẽ quay về hình tròn màu');
});

test('mọi vùng đều có ô nền và vật cản', () => {
  for (const z of zones.all()) {
    const t = atlas.zones[z.id];
    assert.ok(t, `vùng ${z.id} chưa có ô nền`);
    assert.ok(t.ground.n >= 1, `vùng ${z.id} phải có ít nhất một ô nền`);
    assert.ok(t.prop.w > 0 && t.prop.h > 0, `vùng ${z.id} chưa có vật cản`);
  }
});

test('mọi lớp nhân vật đều có hình riêng', () => {
  const thiếu = classes.all().map((c) => c.id).filter((id) => !atlas.chars[id]);
  assert.deepEqual(thiếu, [], 'không có hình riêng thì Chiến Binh với Pháp Sư nhìn y hệt nhau');
});

test('có sẵn hình dự phòng cho người chưa chọn lớp', () => {
  assert.ok(atlas.chars.none, 'nhân vật mới tạo chưa có lớp — vẫn phải vẽ được');
  const others = Object.keys(atlas.chars).filter((k) => k.startsWith('other'));
  assert.ok(others.length >= 4,
    'quá ít hình phụ thì một phòng đông người toàn những bản sao giống hệt nhau');
});

test('ảnh atlas có thật và không rỗng', () => {
  const png = path.join(__dirname, '..', 'public', 'img', 'atlas.png');
  assert.ok(fs.existsSync(png), 'chạy `node tools/build-sprites.js` để sinh lại');
  assert.ok(fs.statSync(png).size > 4096);
  assert.equal(atlas.cell, 16);
  assert.equal(atlas.dirs, 4);
});
