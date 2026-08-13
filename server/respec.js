'use strict';

const tree = require('./data/skilltree');
const progression = require('./progression');
const skillData = require('./data/skills');

/**
 * Rửa điểm — trả lại điểm chỉ số hoặc điểm kỹ năng để phân bổ lại.
 *
 * Vì sao cần: cả hai loại điểm đều tiêu **không hoàn tác được**, mà người chơi
 * chỉ biết mình chọn sai sau khi đã chơi vài chục giờ. Không có đường sửa thì
 * lựa chọn duy nhất là bỏ nhân vật làm lại từ cấp 1 — và đó là lúc họ bỏ game
 * luôn thay vì làm lại.
 *
 * HAI nguyên tắc:
 *
 * 1. **Trả bằng VÀNG, không miễn phí.** Rửa miễn phí thì không còn quyết định
 *    nào là quyết định: cứ đổi qua đổi lại trước mỗi trận. Giá phải đủ đau để
 *    người chơi cân nhắc, nhưng không đắt tới mức phải cày cả buổi mới sửa nổi
 *    một cú bấm nhầm.
 *
 * 2. **Rửa kỹ năng KHÔNG đụng tới Dị Điển.** Sách đã gắn là tài sản, không phải
 *    lựa chọn phân bổ — quét sạch chúng là xoá vĩnh viễn thứ người chơi mất
 *    hàng chục giờ mới rơi ra được. Chỉ Cây Nền, bậc kỹ năng và Tinh Thông về 0.
 */

/**
 * Giá rửa, tính bằng vàng.
 *
 * Tăng theo **bình phương cấp** chứ không tuyến tính, vì vàng kiếm được cũng
 * tăng nhanh hơn tuyến tính: một con quái thường cho 53 vàng ở vùng cấp 10 mà
 * 986 vàng ở vùng cấp 60. Giá tuyến tính thì cấp 60 rửa xong trong hai phút,
 * còn cấp 10 phải cày cả buổi cho cùng một cú bấm nhầm.
 *
 * Quy ra số con quái phải hạ, giá này gần như phẳng ở mọi cấp:
 *
 *   cấp 10 — chỉ số   600 vàng ≈ 11 con  ·  kỹ năng  1.000 ≈ 19 con
 *   cấp 30 — chỉ số 5.400 vàng ≈ 30 con  ·  kỹ năng  9.000 ≈ 50 con
 *   cấp 60 — chỉ số 21.600 vàng ≈ 22 con ·  kỹ năng 36.000 ≈ 36 con
 *
 * Rửa kỹ năng đắt hơn rửa chỉ số vì nó trả lại nhiều thứ hơn và là quyết định
 * nặng hơn: Cây Nền, bậc từng chiêu, và cả Tinh Thông.
 */
const GOLD_SCALE = { stats: 30, skills: 50 };

const priceFor = (kind, level) =>
  Math.max(200, Math.round((GOLD_SCALE[kind] || 6) * Math.max(1, level) ** 2 / 5));

/** Giá cả hai loại, để giao diện hiện sẵn chứ không bắt bấm rồi mới biết. */
function prices(level) {
  return { stats: priceFor('stats', level), skills: priceFor('skills', level) };
}

/**
 * Trả lại toàn bộ điểm chỉ số đã phân bổ.
 *
 * Mọi chỉ số về 5 — mốc khởi đầu trong `stats.js`. Số điểm trả lại tính bằng
 * `3 × (cấp − 1)` chứ KHÔNG bằng tổng chỉ số hiện có trừ đi 25: hai cách ra
 * cùng kết quả khi mọi thứ bình thường, nhưng cách sau sẽ nhân bản điểm nếu
 * sau này có nguồn chỉ số nào khác ngoài lên cấp.
 */
const BASE_STAT = 5;
const STAT_KEYS = ['str', 'int', 'vit', 'agi', 'wil'];

function resetStats(p) {
  const price = priceFor('stats', p.level);
  if ((p.gold || 0) < price) return { ok: false, error: `Cần ${price.toLocaleString('vi-VN')} vàng, còn ${(p.gold || 0).toLocaleString('vi-VN')}.` };

  const earned = progression.STAT_POINTS_PER_LEVEL * (p.level - 1);
  if (earned === 0 && (p.statPoints || 0) === 0) {
    return { ok: false, error: 'Chưa có điểm chỉ số nào để rửa.' };
  }
  if ((p.statPoints || 0) >= earned) {
    return { ok: false, error: 'Chưa tiêu điểm chỉ số nào — không có gì để trả lại.' };
  }

  p.gold -= price;
  for (const k of STAT_KEYS) p.stats[k] = BASE_STAT;
  p.statPoints = earned;

  return { ok: true, price, points: earned };
}

/**
 * Trả lại toàn bộ điểm kỹ năng: Cây Nền, bậc kỹ năng, Tinh Thông.
 *
 * `bookRanks` cũng bị xoá cùng `skillRanks`. Bậc lên bằng sách không được tính
 * là điểm đã tiêu, nên giữ lại nó sau khi bảng bậc đã trống là để một con số mồ
 * côi trỏ vào kỹ năng không còn bậc nào — lần nâng bậc sau sẽ tính sai.
 *
 * Bộ mang theo giữ lại đúng những chiêu vẫn còn mở (chiêu bẩm sinh và chiêu từ
 * Dị Điển đang gắn). Xoá trắng thì người chơi vào trận sau khi rửa chỉ còn hai
 * chiêu bẩm sinh mà không hiểu vì sao.
 */
function resetSkills(p) {
  const price = priceFor('skills', p.level);
  if ((p.gold || 0) < price) return { ok: false, error: `Cần ${price.toLocaleString('vi-VN')} vàng, còn ${(p.gold || 0).toLocaleString('vi-VN')}.` };

  const spent = tree.pointsSpent(p.className, p.learned)
    + tree.rankPointsSpent(p.skillRanks, p.bookRanks)
    + tree.masteryPointsSpent(p.mastery);
  if (spent === 0) return { ok: false, error: 'Chưa tiêu điểm kỹ năng nào — không có gì để trả lại.' };

  p.gold -= price;
  p.learned = [];
  p.skillRanks = {};
  p.bookRanks = {};
  p.mastery = {};

  const stillOpen = tree.unlockedSkills(p.className, p.learned, p.codex);
  p.carried = (p.carried || [])
    .filter((id) => stillOpen.includes(id))
    .slice(0, skillData.MAX_LOADOUT);

  return { ok: true, price, points: spent };
}

module.exports = { GOLD_SCALE, BASE_STAT, priceFor, prices, resetStats, resetSkills };
