'use strict';

const items = require('./data/items');
const nations = require('./data/nations');

/**
 * Cửa hàng của thương nhân — nơi vàng cuối cùng cũng có đường ra.
 *
 * Trước khi có file này, vàng chỉ có đường vào: đánh xong cộng thêm, và không
 * bao giờ tiêu đi đâu được. Một con số chỉ tăng thì sau vài giờ chơi nó thôi
 * mang ý nghĩa, và cả đặc quyền "phí giao dịch −50%" của Duskmoor cũng nằm chết
 * trong `data/nations.js` không ai đọc tới.
 *
 * HAI nguyên tắc chi phối mọi con số ở đây:
 *
 * 1. **Quầy hàng KHÔNG bán đồ hạng cao.** Chỉ Thường · Tinh Xảo · Hiếm. Nếu mua
 *    được đồ Sử Thi và Truyền Thuyết thì cả hệ thống rớt đồ mất ý nghĩa — đi
 *    săn Thủ Lĩnh làm gì khi đứng ở chợ bấm nút là có?
 *
 * 2. **Bán rẻ hơn mua rất nhiều.** Chênh lệch `BUY_MULT` chặn cái vòng lặp mua
 *    đi bán lại để đẻ ra vàng từ không khí.
 */

/* ------------------------------------------------------------- giá cả ----- */

/**
 * Giá trị gốc của một món, tính bằng vàng. Cùng một hàm cho cả mua lẫn bán để
 * không bao giờ có chuyện giá bán vọt lên trên giá mua ở một hạng nào đó.
 */
const GOLD_PER_LEVEL = 9;
const RARITY_VALUE = { common: 1, fine: 1.7, rare: 3.4, epic: 7, legendary: 15 };

function value(item) {
  if (!item) return 0;
  const mult = RARITY_VALUE[item.rarity] || 1;
  return Math.max(1, Math.round(GOLD_PER_LEVEL * (item.level || 1) * mult));
}

/**
 * Phí giao dịch. Duskmoor giảm một nửa — đây là chỗ `tradeFeePercent` trong
 * `data/nations.js` cuối cùng có tác dụng thật, sau một thời gian dài chỉ là
 * một dòng mô tả trên màn tạo nhân vật.
 */
const BASE_FEE = 0.25;

/** Mua đắt gấp mấy lần giá gốc. Đây là thứ chặn vòng lặp mua-bán đẻ vàng. */
const BUY_MULT = 3.2;

function feeFor(nationId) {
  const mod = nations.get(nationId)?.privilege?.effect?.tradeFeePercent || 0;
  return Math.max(0, BASE_FEE * (1 + mod));
}

const sellPrice = (item, nationId) => Math.max(1, Math.round(value(item) * (1 - feeFor(nationId))));
const buyPrice = (item, nationId) => Math.max(1, Math.round(value(item) * BUY_MULT * (1 + feeFor(nationId))));

/* -------------------------------------------------------- sách Dị Điển ---- */

/**
 * Sách Dị Điển trùng lặp chất đống nhanh hơn số ô để gắn — mười ô, mà sách thì
 * rơi mãi. Trước đây sách trùng một kỹ năng chưa gắn ô nào là rác tuyệt đối:
 * gắn thì phí ô, tiêu thì không được, vứt cũng không xong.
 *
 * Giá tính theo CẤP NGƯỜI BÁN chứ không theo con quái đã rơi ra nó, vì hai lý
 * do. Thứ nhất, sách cũ lưu trong database không có trường cấp — tính theo nó
 * là hàng nghìn cuốn của người chơi cũ bỗng đáng giá một đồng. Thứ hai, một
 * cuốn Dị Điển đáng bao nhiêu là tuỳ nó làm được gì cho anh BÂY GIỜ, không phải
 * tuỳ con quái đã chết từ ba chục cấp trước.
 *
 * Hạng quái vẫn có mặt: sách rơi từ Thủ Lĩnh hiếm gấp tám lần sách quái thường
 * (40% so với 5%), nên nó phải bán được nhiều hơn hẳn.
 */
const BOOK_TIER_VALUE = { common: 4, elite: 8, boss: 16 };

function bookValue(book, level = 1) {
  const mult = BOOK_TIER_VALUE[book?.tier] || BOOK_TIER_VALUE.common;
  return Math.max(1, Math.round(GOLD_PER_LEVEL * Math.max(1, level) * mult));
}

const bookSellPrice = (book, level, nationId) =>
  Math.max(1, Math.round(bookValue(book, level) * (1 - feeFor(nationId))));

/* ------------------------------------------------------------ quầy hàng --- */

const STOCK_SIZE = 6;
const RESTOCK_MS = 10 * 60 * 1000;

/** Hạng bán được và trọng số. Sử Thi và Truyền Thuyết cố ý vắng mặt. */
const STOCK_RARITIES = [
  { v: 'common', w: 46 },
  { v: 'fine', w: 38 },
  { v: 'rare', w: 16 },
];

/** PRNG cùng loại với server/map.js — cùng hạt giống thì cùng kết quả. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const windowOf = (now) => Math.floor(now / RESTOCK_MS);

/** Còn bao nhiêu giây tới lượt đổi hàng. */
const nextRestockIn = (now) => Math.ceil(((windowOf(now) + 1) * RESTOCK_MS - now) / 1000);

/**
 * Sinh quầy hàng cho một người chơi.
 *
 * Hạt giống buộc vào (nhân vật, khung thời gian) chứ không bốc tự do, nên thoát
 * ra vào lại vẫn thấy ĐÚNG những món cũ. Không có ràng buộc đó thì quầy hàng
 * biến thành máy quay xổ số: cứ rời phòng rồi quay lại tới lúc hiện ra món vừa
 * ý, và cái giới hạn "không bán đồ hạng cao" cũng chẳng còn ý nghĩa vì người
 * chơi quay đủ lâu là gom được cả bộ Hiếm.
 *
 * Cấp món bám sát cấp người chơi, lệch xuống nhiều hơn lệch lên: mua được đồ
 * cao hơn mình vài cấp là món hời, cao hơn chục cấp là bỏ qua cả chặng chơi.
 */
function rollStock(p, now = Date.now()) {
  const key = `${p.characterId || p.name || p.id}:${windowOf(now)}`;
  const rnd = mulberry32(hash(key));
  const level = Math.max(1, p.level || 1);

  const stock = [];
  for (let i = 0; i < STOCK_SIZE; i++) {
    const rarity = pickWeighted(STOCK_RARITIES, rnd);
    const spread = Math.round((rnd() * 5) - 3);   // −3 … +2
    stock.push(items.generate(Math.max(1, level + spread), { rarity, rng: rnd }));
  }
  return stock;
}

function pickWeighted(entries, rnd) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rnd() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.v;
  }
  return entries[entries.length - 1].v;
}

/**
 * Quầy hàng hiện tại của một người chơi, sinh lại khi qua khung thời gian mới.
 *
 * Giữ trong RAM theo phiên chơi. Hàng chưa mua không cần lưu xuống database:
 * nó tự dựng lại y hệt từ hạt giống, và mất điện giữa chừng thì cùng lắm là
 * người chơi thấy quầy đổi sớm hơn mười phút.
 */
function stockFor(p, now = Date.now()) {
  const win = windowOf(now);
  if (!p.shopStock || p.shopWindow !== win) {
    p.shopStock = rollStock(p, now);
    p.shopWindow = win;
  }
  return p.shopStock;
}

/* --------------------------------------------------------- gửi client ---- */

/**
 * Toàn bộ những gì màn cửa hàng cần vẽ, tính lại từ đầu sau MỖI thao tác.
 *
 * Giá bán đi kèm từng món thay vì để client tự nhân: công thức có phí giao dịch
 * phụ thuộc quốc gia, và hai bản công thức ở hai nơi là kiểu lệch nhau âm thầm
 * mà chỉ người chơi Duskmoor mới phát hiện ra.
 */
function stateFor(p, npc, now = Date.now()) {
  return {
    npc: { id: npc.id, name: npc.name, role: npc.role, greet: npc.greet },
    gold: p.gold,
    fee: Math.round(feeFor(p.nation) * 100),
    baseFee: Math.round(BASE_FEE * 100),
    restockIn: nextRestockIn(now),
    stock: stockFor(p, now).map((it) => ({ ...it, price: buyPrice(it, p.nation) })),
    bag: (p.inv?.bag || []).map((it) => ({ ...it, price: sellPrice(it, p.nation) })),
    bagSize: p.inv?.bag?.length || 0,
    // Chỉ sách CHƯA gắn. Sách đang nằm trong ô Dị Điển là kỹ năng đang dùng,
    // không phải hàng hoá — muốn bán thì gỡ ra trước, và gỡ ra là xoá luôn.
    books: (p.books || []).map((b) => ({
      uid: b.uid, name: b.name, from: b.from, tier: b.tier,
      skillId: b.skillId, desc: b.desc,
      price: bookSellPrice(b, p.level, p.nation),
    })),
  };
}

/* ------------------------------------------------------------ thao tác ---- */

/**
 * Mua một món. Trả về `{ ok, error }` theo đúng giao kèo của `invAction` trong
 * server/net.js — chỗ gọi lo việc gửi lại bảng nhân vật và lưu tiến trình.
 */
function buy(p, uid, inventory) {
  const stock = stockFor(p);
  const idx = stock.findIndex((i) => i.uid === uid);
  if (idx < 0) return { ok: false, error: 'Món này không còn trên quầy.' };

  const item = stock[idx];
  const price = buyPrice(item, p.nation);
  if (p.gold < price) return { ok: false, error: `Thiếu ${price - p.gold} vàng.` };
  if (inventory.bagFull(p.inv)) return { ok: false, error: 'Túi đã đầy — dọn bớt rồi quay lại.' };

  p.gold -= price;
  inventory.addItem(p.inv, item);
  stock.splice(idx, 1);

  return { ok: true, bought: { name: item.name, rarity: item.rarity, price } };
}

/**
 * Bán một hoặc nhiều món trong TÚI.
 *
 * Không bao giờ đụng tới đồ đang mặc, cùng lý do với `inventory.discardMany`:
 * người chơi tick chọn mười mấy ô rồi bấm bán, một cái tick lỡ tay mà lột luôn
 * món trên người thì không có đường cứu. Muốn bán đồ đang mặc thì tháo ra trước.
 */
function sell(p, uids) {
  const wanted = new Set(Array.isArray(uids) ? uids : []);
  if (!wanted.size) return { ok: false, error: 'Chưa chọn món nào.' };

  const sold = p.inv.bag.filter((i) => wanted.has(i.uid));
  if (!sold.length) return { ok: false, error: 'Không tìm thấy món nào trong túi.' };

  const gold = sold.reduce((sum, i) => sum + sellPrice(i, p.nation), 0);
  p.inv.bag = p.inv.bag.filter((i) => !wanted.has(i.uid));
  p.gold += gold;

  return {
    ok: true,
    gold,
    sold: sold.map((i) => ({ uid: i.uid, name: i.name, rarity: i.rarity })),
  };
}

/**
 * Bán sách Dị Điển CHƯA gắn.
 *
 * Không đụng tới `p.codex` — sách đã gắn là kỹ năng đang dùng, và một cái tick
 * lỡ tay mà bán mất chiêu đang mang vào trận thì không có đường cứu. Muốn bán
 * thì gỡ khỏi ô trước, đó là một hành động riêng và có hỏi lại.
 */
function sellBooks(p, uids) {
  const wanted = new Set(Array.isArray(uids) ? uids : []);
  if (!wanted.size) return { ok: false, error: 'Chưa chọn cuốn nào.' };

  const sold = (p.books || []).filter((b) => wanted.has(b.uid));
  if (!sold.length) return { ok: false, error: 'Không tìm thấy cuốn nào chưa gắn.' };

  const gold = sold.reduce((sum, b) => sum + bookSellPrice(b, p.level, p.nation), 0);
  p.books = p.books.filter((b) => !wanted.has(b.uid));
  p.gold += gold;

  return { ok: true, gold, sold: sold.map((b) => ({ uid: b.uid, name: b.name, tier: b.tier })) };
}

module.exports = {
  GOLD_PER_LEVEL, RARITY_VALUE, BASE_FEE, BUY_MULT, STOCK_SIZE, RESTOCK_MS,
  BOOK_TIER_VALUE,
  value, feeFor, sellPrice, buyPrice, bookValue, bookSellPrice,
  stockFor, rollStock, nextRestockIn,
  stateFor, buy, sell, sellBooks,
};
