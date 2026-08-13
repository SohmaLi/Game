'use strict';

const tree = require('./data/skilltree');
const skillData = require('./data/skills');

/**
 * Mọi thao tác với Dị Điển: gắn · gỡ · vứt · tiêu sách trùng để nâng bậc.
 *
 * Tách khỏi `net.js` vì bốn việc này chia nhau đúng một bộ luật, và bộ luật đó
 * có những chỗ dễ quên: gỡ một ô thì chiêu phải rời bộ mang theo, bậc phải quay
 * về túi điểm, mà chỉ khi kỹ năng không còn đường nào khác để dùng. Bốn bản sao
 * của cùng một luật nằm rải trong bốn handler socket là bốn chỗ để lệch nhau.
 *
 * Mỗi hàm trả về `{ ok, error }` theo đúng giao kèo của `invAction` trong
 * `net.js` — chỗ gọi lo việc gửi lại bảng nhân vật và lưu tiến trình.
 */

/** Kỹ năng này còn dùng được sau khi đã đổi `p.codex` chưa. */
function stillUsable(p, skillId) {
  return tree.unlockedSkills(p.className, p.learned, p.codex).includes(skillId);
}

/**
 * Dọn sạch dấu vết của một kỹ năng vừa mất chỗ đứng.
 *
 * Bậc phải quên hẳn: `rankPointsSpent` cộng theo TOÀN BỘ bảng bậc, nên một kỹ
 * năng đã biến mất mà bậc còn nằm đó là một khoản điểm bị khoá vĩnh viễn vào
 * thứ không dùng được nữa.
 */
function releaseSkill(p, skillId) {
  // Còn đường khác để dùng — Cây Nền có sẵn chiêu đó, hay một ô Dị Điển khác
  // cũng gắn nó — thì không đụng gì cả. Nhấc nó khỏi bộ mang theo lúc này là
  // tự tay bỏ trống một ô trận đấu của một chiêu vẫn đang mở bình thường.
  if (!skillId || stillUsable(p, skillId)) return;

  p.carried = (p.carried || []).filter((id) => id !== skillId);
  Object.assign(p, tree.forgetRank(skillId, p.skillRanks, p.bookRanks));
}

/**
 * Gắn một cuốn sách vào ô. Ô đã có sách thì sách cũ bị **xoá vĩnh viễn**
 * (DESIGN.md §3.4) — client phải hỏi lại trước khi gọi.
 */
function socketBook(p, slotRaw, uid) {
  const slot = parseInt(slotRaw, 10);
  if (!(slot >= 0 && slot < tree.CODEX_SLOTS)) return { ok: false, error: 'Ô không hợp lệ.' };

  const book = (p.books || []).find((b) => b.uid === uid);
  if (!book) return { ok: false, error: 'Không tìm thấy sách.' };

  /**
   * Một kỹ năng chỉ được chiếm MỘT ô.
   *
   * Bậc kỹ năng tra theo `skillId`, nên ô thứ hai của cùng một kỹ năng không
   * cho thêm gì hết: cùng chiêu đó, cùng bậc đó, chỉ mất một ô trong mười.
   * Người chơi không có cách nào nhìn ra điều đó từ giao diện — hai ô hiện y
   * hệt nhau, cùng "Bậc 2/5". Đường dùng đúng cho sách trùng là `upgrade`, và
   * câu báo lỗi phải chỉ thẳng sang đó.
   */
  const dupAt = (p.codex || []).findIndex((b, i) => b?.skillId === book.skillId && i !== slot);
  if (dupAt >= 0) {
    return {
      ok: false,
      error: `Kỹ năng này đã gắn ở ô ${dupAt + 1}. Ô thứ hai không cho thêm gì — `
        + 'hãy tiêu cuốn này để nâng bậc thay vì gắn.',
    };
  }

  const old = p.codex[slot];
  p.codex[slot] = book;
  p.books = p.books.filter((b) => b.uid !== uid);

  if (old?.skillId) releaseSkill(p, old.skillId);

  // Gắn sách xong mà chiêu vẫn nằm ngoài trận thì gắn để làm gì. Giống hệt lúc
  // học một nút chủ động trong Cây Nền: còn chỗ thì mang theo luôn.
  if (book.skillId && !p.carried.includes(book.skillId)
      && p.carried.length < skillData.MAX_LOADOUT) {
    p.carried.push(book.skillId);
  }
  return { ok: true, replaced: old?.name || null };
}

/**
 * Gỡ sách khỏi ô — sách bị xoá vĩnh viễn.
 *
 * Trước đây chỉ có đường gắn đè, nên một ô lỡ gắn nhầm là hỏng vĩnh viễn cho
 * tới khi rơi được cuốn khác để đè lên.
 */
function unsocket(p, slotRaw) {
  const slot = parseInt(slotRaw, 10);
  if (!(slot >= 0 && slot < tree.CODEX_SLOTS)) return { ok: false, error: 'Ô không hợp lệ.' };

  const book = p.codex[slot];
  if (!book) return { ok: false, error: 'Ô này đang trống.' };

  p.codex[slot] = null;
  releaseSkill(p, book.skillId);
  return { ok: true, removed: book.name || null };
}

/**
 * Vứt sách CHƯA gắn. Nhận thẳng danh sách uid, cùng lý do với
 * `inventory.discardMany`: server không nhận điều kiện lọc kiểu "xoá hết sách
 * trùng", vì một lỗi lọc ở server là quét sạch kho sách của người chơi.
 */
function discard(p, uids) {
  const wanted = new Set(Array.isArray(uids) ? uids : []);
  if (!wanted.size) return { ok: false, error: 'Chưa chọn cuốn nào.' };

  const gone = (p.books || []).filter((b) => wanted.has(b.uid));
  if (!gone.length) return { ok: false, error: 'Không tìm thấy sách nào.' };

  p.books = p.books.filter((b) => !wanted.has(b.uid));
  return { ok: true, count: gone.length, names: gone.map((b) => b.name) };
}

/**
 * Tiêu một cuốn sách CHƯA gắn để nâng bậc kỹ năng cùng tên ĐANG gắn ở một ô
 * khác. Miễn phí — không tốn điểm kỹ năng, và `bookRanks` là chỗ ghi lại điều
 * đó để `rankPointsSpent` đừng tính nhầm.
 */
function upgrade(p, uid) {
  const book = (p.books || []).find((b) => b.uid === uid);
  if (!book) return { ok: false, error: 'Không tìm thấy sách.' };

  const socketed = (p.codex || []).some((b) => b?.skillId === book.skillId);
  if (!socketed) return { ok: false, error: 'Kỹ năng này chưa gắn vào ô Dị Điển nào — gắn vào ô trống trước.' };

  const rank = tree.rankOf(book.skillId, p.skillRanks);
  if (rank >= tree.MAX_SKILL_RANK) return { ok: false, error: `Kỹ năng đã đạt bậc tối đa (${tree.MAX_SKILL_RANK}).` };

  p.skillRanks = { ...p.skillRanks, [book.skillId]: rank + 1 };
  p.bookRanks = { ...p.bookRanks, [book.skillId]: (p.bookRanks?.[book.skillId] || 0) + 1 };
  p.books = p.books.filter((b) => b.uid !== uid);

  return { ok: true, skillId: book.skillId, rank: rank + 1 };
}

module.exports = { socketBook, unsocket, discard, upgrade, releaseSkill };
