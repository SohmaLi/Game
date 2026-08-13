'use strict';

/**
 * Dị Điển: gỡ sách, vứt sách, bán sách, và chặn gắn trùng.
 *
 * Ảnh chụp của người chơi cho thấy ba chỗ hỏng cùng lúc: hai ô khác nhau gắn
 * CÙNG một Dị Điển (ô thứ hai không cho thêm gì), bảy cuốn chưa gắn nằm không
 * vì không có đường ra nào, và một ô lỡ gắn nhầm thì hỏng vĩnh viễn cho tới
 * khi rơi được cuốn khác để đè lên.
 */

const test = require('node:test');
const assert = require('node:assert');

const tree = require('../server/data/skilltree');
const shop = require('../server/shop');
const codex = require('../server/codex');

/* ------------------------------------------------ điểm và bậc --------- */

test('bậc lên bằng SÁCH không ăn điểm kỹ năng', () => {
  // Cùng một nhân vật bậc 3, khác nhau ở chỗ hai bậc đó mua bằng gì
  const byPoints = tree.pointsLeft('warrior', 30, [], { heavy_slash: 3 }, {});
  const byBooks = tree.pointsLeft('warrior', 30, [], { heavy_slash: 3 }, { heavy_slash: 2 });

  assert.equal(byPoints, 30 - 2);
  assert.equal(byBooks, 30,
    'giao diện nói tiêu sách trùng là miễn phí — trước đây mỗi cuốn lặng lẽ lấy mất một điểm');
});

test('nửa điểm nửa sách thì chỉ phần mua bằng điểm mới bị trừ', () => {
  const left = tree.pointsLeft('warrior', 30, [], { heavy_slash: 5 }, { heavy_slash: 3 });
  assert.equal(left, 30 - 1, 'bậc 5 = 4 nấc, 3 nấc do sách → chỉ 1 nấc là điểm');
});

test('quên bậc thì trả lại điểm, và không trả lại phần đã mua bằng sách', () => {
  const ranks = { d_venom: 4, heavy_slash: 2 };
  const books = { d_venom: 2 };
  assert.equal(tree.rankPointsSpent(ranks, books), 1 + 1);

  const after = tree.forgetRank('d_venom', ranks, books);
  assert.equal(after.skillRanks.d_venom, undefined);
  assert.equal(after.bookRanks.d_venom, undefined);
  assert.equal(tree.rankPointsSpent(after.skillRanks, after.bookRanks), 1,
    'chỉ còn heavy_slash — điểm dồn vào kỹ năng đã biến mất phải quay về túi');
  assert.equal(ranks.d_venom, 4, 'forgetRank không được sửa bảng gốc');
});

test('bảng bậc rỗng thì không tiêu điểm nào', () => {
  assert.equal(tree.rankPointsSpent({}, {}), 0);
  assert.equal(tree.rankPointsSpent(undefined, undefined), 0);
});

/* ------------------------------------------------ giá sách ------------ */

test('sách Thủ Lĩnh đáng giá hơn hẳn sách quái thường — nó hiếm gấp tám lần', () => {
  const lv = 30;
  const common = shop.bookValue({ tier: 'common' }, lv);
  const elite = shop.bookValue({ tier: 'elite' }, lv);
  const boss = shop.bookValue({ tier: 'boss' }, lv);

  assert.ok(common < elite && elite < boss);
  assert.equal(boss / common, 4, 'tỉ lệ rơi 5% so với 40%');
});

test('sách cũ trong database không có trường tier vẫn ra giá dùng được', () => {
  assert.equal(shop.bookValue({}, 30), shop.bookValue({ tier: 'common' }, 30));
  assert.ok(shop.bookValue(null, 30) > 0);
});

test('giá sách bám theo cấp người bán, không theo con quái đã chết ba chục cấp trước', () => {
  assert.ok(shop.bookValue({ tier: 'common' }, 60) > shop.bookValue({ tier: 'common' }, 10));
});

test('phí giao dịch cắt vào giá bán sách, và Duskmoor được giảm một nửa', () => {
  const book = { tier: 'elite' };
  const raw = shop.bookValue(book, 30);
  const plain = shop.bookSellPrice(book, 30, null);
  const dusk = shop.bookSellPrice(book, 30, 'duskmoor');

  assert.ok(plain < raw, 'không trừ phí thì đặc quyền Duskmoor lại thành vô nghĩa');
  assert.ok(dusk > plain);
});

/* ------------------------------------------------ bán sách ------------ */

const player = (over = {}) => ({
  level: 30, gold: 0, nation: null,
  books: [
    { uid: 'b1', tier: 'common', name: 'Dị Điển: Tiếng Hú', skillId: 'd_howl' },
    { uid: 'b2', tier: 'boss', name: 'Dị Điển: Nọc Độc', skillId: 'd_venom' },
  ],
  codex: Array(tree.CODEX_SLOTS).fill(null),
  ...over,
});

test('bán sách: sách đi, vàng về, đúng bằng tổng giá từng cuốn', () => {
  const p = player();
  const want = shop.bookSellPrice(p.books[0], p.level, p.nation)
    + shop.bookSellPrice(p.books[1], p.level, p.nation);

  const res = shop.sellBooks(p, ['b1', 'b2']);

  assert.equal(res.ok, true);
  assert.equal(res.gold, want);
  assert.equal(p.gold, want);
  assert.equal(p.books.length, 0);
});

test('bán sách KHÔNG bao giờ đụng tới sách đang gắn trong ô', () => {
  const p = player();
  p.codex[0] = { uid: 'socketed', tier: 'boss', name: 'Đang dùng', skillId: 'd_venom' };

  const res = shop.sellBooks(p, ['socketed']);

  assert.equal(res.ok, false, 'một cái tick lỡ tay mà bán mất chiêu đang mang vào trận thì không có đường cứu');
  assert.ok(p.codex[0]);
  assert.equal(p.gold, 0);
});

test('gửi lên danh sách rỗng hay uid không có thật thì không mất gì', () => {
  const p = player();
  assert.equal(shop.sellBooks(p, []).ok, false);
  assert.equal(shop.sellBooks(p, ['khong-co']).ok, false);
  assert.equal(p.books.length, 2);
  assert.equal(p.gold, 0);
});

/* ------------------------------------------------ gắn · gỡ · vứt ------ */

const BOOK = (uid, skillId, name) => ({ uid, skillId, name, from: 'Sói Xám', tier: 'common' });

function hero(over = {}) {
  return {
    className: 'warrior', level: 30,
    learned: ['heavy_slash'],
    carried: ['heavy_slash'],
    codex: Array(tree.CODEX_SLOTS).fill(null),
    books: [],
    skillRanks: {}, bookRanks: {},
    ...over,
  };
}

test('gắn sách vào ô trống thì chiêu tự vào bộ mang theo', () => {
  const p = hero({ books: [BOOK('b1', 'd_venom', 'Nọc Độc')] });

  assert.equal(codex.socketBook(p, 0, 'b1').ok, true);
  assert.equal(p.codex[0].uid, 'b1');
  assert.equal(p.books.length, 0);
  assert.ok(p.carried.includes('d_venom'), 'gắn xong mà chiêu vẫn nằm ngoài trận thì gắn để làm gì');
});

test('KHÔNG gắn được hai ô cùng một kỹ năng — đúng chỗ hỏng trong ảnh người chơi gửi', () => {
  const p = hero({ books: [BOOK('b2', 'd_venom', 'Nọc Độc')] });
  p.codex[3] = BOOK('cũ', 'd_venom', 'Nọc Độc');

  const res = codex.socketBook(p, 0, 'b2');

  assert.equal(res.ok, false);
  assert.match(res.error, /ô 4/, 'câu từ chối phải chỉ ra ô nào đang giữ, không nói chung chung');
  assert.match(res.error, /nâng bậc/, 'và phải chỉ sang đường dùng đúng cho sách trùng');
  assert.equal(p.codex[0], null);
  assert.equal(p.books.length, 1, 'từ chối thì sách phải còn nguyên trong kho');
});

test('gắn đè lên ô đã có thì sách cũ mất, chiêu cũ rời bộ mang theo', () => {
  const p = hero({ books: [BOOK('moi', 'd_howl', 'Tiếng Hú')], carried: ['heavy_slash', 'd_venom'] });
  p.codex[0] = BOOK('cu', 'd_venom', 'Nọc Độc');

  const res = codex.socketBook(p, 0, 'moi');

  assert.equal(res.replaced, 'Nọc Độc');
  assert.equal(p.codex[0].uid, 'moi');
  assert.ok(!p.carried.includes('d_venom'), 'chiêu không còn mở mà vẫn nằm trong bộ mang theo là một ô trận đấu bỏ trống');
});

test('gỡ sách khỏi ô: sách mất, chiêu rời bộ mang theo, điểm bậc quay về túi', () => {
  const p = hero({ carried: ['heavy_slash', 'd_venom'], skillRanks: { d_venom: 3 }, bookRanks: {} });
  p.codex[2] = BOOK('x', 'd_venom', 'Nọc Độc');

  const before = tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks);
  const res = codex.unsocket(p, 2);

  assert.equal(res.ok, true);
  assert.equal(res.removed, 'Nọc Độc');
  assert.equal(p.codex[2], null);
  assert.ok(!p.carried.includes('d_venom'));
  assert.equal(
    tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks),
    before + 2,
    'bậc 3 tốn 2 điểm — kỹ năng biến mất thì hai điểm đó phải quay về, không thì chúng bị khoá vĩnh viễn'
  );
});

test('gỡ một ô mà kỹ năng vẫn còn đường khác thì KHÔNG xoá bậc', () => {
  // Cây Nền đã có sẵn chiêu đó — bậc vẫn đang phục vụ người chơi
  const p = hero({ skillRanks: { heavy_slash: 4 }, carried: ['heavy_slash'] });
  p.codex[0] = BOOK('x', 'heavy_slash', 'Chém Mạnh');

  codex.unsocket(p, 0);

  assert.equal(p.skillRanks.heavy_slash, 4, 'xoá bậc lúc này là cướp không của người chơi');
  assert.ok(p.carried.includes('heavy_slash'), 'chiêu vẫn mở từ Cây Nền nên vẫn mang theo được');
});

test('ô trống hay số ô bậy thì gỡ không được, và không làm hỏng gì', () => {
  const p = hero();
  assert.equal(codex.unsocket(p, 0).ok, false);
  assert.equal(codex.unsocket(p, -1).ok, false);
  assert.equal(codex.unsocket(p, 99).ok, false);
  assert.equal(codex.unsocket(p, 'x').ok, false);
});

test('vứt sách chưa gắn — và chỉ vứt đúng cuốn được chọn', () => {
  const p = hero({ books: [BOOK('a', 'd_venom', 'A'), BOOK('b', 'd_howl', 'B')] });

  const res = codex.discard(p, ['a']);

  assert.equal(res.ok, true);
  assert.equal(res.count, 1);
  assert.deepEqual(p.books.map((b) => b.uid), ['b']);
});

test('vứt danh sách rỗng hoặc uid không có thật thì không mất gì', () => {
  const p = hero({ books: [BOOK('a', 'd_venom', 'A')] });
  assert.equal(codex.discard(p, []).ok, false);
  assert.equal(codex.discard(p, ['khong-co']).ok, false);
  assert.equal(p.books.length, 1);
});

test('tiêu sách trùng để nâng bậc: sách mất, bậc lên, điểm kỹ năng KHÔNG suy suyển', () => {
  const p = hero({ books: [BOOK('dup', 'd_venom', 'Nọc Độc')] });
  p.codex[0] = BOOK('goc', 'd_venom', 'Nọc Độc');

  const before = tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks);
  const res = codex.upgrade(p, 'dup');

  assert.equal(res.rank, 2);
  assert.equal(p.books.length, 0);
  assert.equal(p.bookRanks.d_venom, 1);
  assert.equal(tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks), before,
    'cả giao diện lẫn mô tả đều nói việc này miễn phí');
});

test('sách của kỹ năng chưa gắn ô nào thì không tiêu để nâng bậc được', () => {
  const p = hero({ books: [BOOK('b', 'd_howl', 'Tiếng Hú')] });
  const res = codex.upgrade(p, 'b');

  assert.equal(res.ok, false);
  assert.equal(p.books.length, 1);
});

test('kỹ năng đã kịch bậc thì cuốn trùng không tiêu được nữa', () => {
  const p = hero({ books: [BOOK('dup', 'd_venom', 'X')], skillRanks: { d_venom: tree.MAX_SKILL_RANK } });
  p.codex[0] = BOOK('goc', 'd_venom', 'X');

  assert.equal(codex.upgrade(p, 'dup').ok, false);
  assert.equal(p.books.length, 1, 'từ chối mà vẫn nuốt mất cuốn sách thì tệ hơn cả không cho bấm');
});

test('gỡ ô sau khi đã nâng bậc bằng sách thì bậc từ sách mất luôn, không hoá thành điểm', () => {
  const p = hero({ books: [BOOK('dup', 'd_venom', 'X')] });
  p.codex[0] = BOOK('goc', 'd_venom', 'X');
  codex.upgrade(p, 'dup');

  const before = tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks);
  codex.unsocket(p, 0);

  assert.equal(tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks), before,
    'gắn → tiêu sách → gỡ mà đẻ ra điểm kỹ năng thì đó là một cỗ máy in điểm');
  assert.equal(p.bookRanks.d_venom, undefined);
});

test('quầy hàng gửi kèm kho sách chưa gắn, mỗi cuốn một giá', () => {
  const p = player({ inv: { bag: [], equipped: {} } });
  const state = shop.stateFor(p, { id: 'merchant', name: 'X', role: 'r', greet: 'g' });

  assert.equal(state.books.length, 2);
  assert.ok(state.books.every((b) => b.price > 0));
  assert.equal(state.books.find((b) => b.uid === 'b2').tier, 'boss',
    'client tô màu và lọc theo hạng — thiếu trường này thì cả kho sách hiện một màu');
});
