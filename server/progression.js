'use strict';

/**
 * Cấp độ, kinh nghiệm và điểm chỉ số.
 *
 * Đường cong: mỗi cấp cần nhiều hơn cấp trước theo lũy thừa 1.55. Chọn số này
 * để những cấp đầu lên rất nhanh (người chơi mới thấy tiến bộ ngay trong vài
 * phút đầu), rồi chậm dần lại.
 */

const MAX_LEVEL = 60;
const STAT_POINTS_PER_LEVEL = 3;

/** Kinh nghiệm cần để từ `level` lên `level + 1`. */
function expToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(30 * Math.pow(level, 1.55) + 20 * level);
}

/**
 * Cộng kinh nghiệm, tự lên cấp nếu đủ.
 * Trả về thông tin để client hiện hoạt cảnh lên cấp.
 */
function addExp(char, amount) {
  const gained = Math.max(0, Math.round(amount));
  let levelsGained = 0;
  let pointsGained = 0;

  char.exp = (char.exp || 0) + gained;

  while (char.level < MAX_LEVEL && char.exp >= expToNext(char.level)) {
    char.exp -= expToNext(char.level);
    char.level++;
    levelsGained++;
    pointsGained += STAT_POINTS_PER_LEVEL;
  }

  char.statPoints = (char.statPoints || 0) + pointsGained;
  if (char.level >= MAX_LEVEL) char.exp = 0;

  return {
    gained,
    levelsGained,
    pointsGained,
    level: char.level,
    exp: char.exp,
    expNeeded: expToNext(char.level),
  };
}

/**
 * Trừ kinh nghiệm khi thua trận — cái giá duy nhất của việc ngã xuống.
 *
 * Mốc trừ tính theo cấp HIỆN TẠI (`expToNext(level)`) chứ không theo tổng kinh
 * nghiệm đã tích: tổng thì cấp 50 mất gấp hàng trăm lần cấp 2 cho cùng một sai
 * lầm, còn theo cấp hiện tại thì ai cũng mất đúng một phần chặng đường đang đi.
 *
 * KHÔNG BAO GIỜ tụt cấp. Đây là chốt chặn cứng chứ không phải lựa chọn cân bằng:
 * mất một kỹ năng vừa học được vì một trận xui là thứ người chơi bỏ game luôn.
 * Vì vậy `exp` chỉ trừ tới 0 — và cũng vì vậy `statPoints` không đụng tới.
 *
 * @returns { lost, exp, level, expNeeded } — `lost` là số THẬT bị trừ, có thể
 *          nhỏ hơn dự tính khi người chơi vừa lên cấp và chưa tích lại được gì.
 */
function loseExp(char, pct) {
  const need = expToNext(char.level);

  // Cấp trần: `addExp` đã ép `exp` về 0 nên không còn gì để mất, và `need` là
  // Infinity — chặn ở đây cho rõ ràng thay vì để phép nhân ra NaN/Infinity
  const want = Number.isFinite(need) ? Math.round(need * pct) : 0;
  const lost = Math.max(0, Math.min(want, char.exp || 0));

  char.exp = (char.exp || 0) - lost;
  return { lost, exp: char.exp, level: char.level, expNeeded: need };
}

/** Người chơi tự phân bổ điểm. Trả về null nếu không hợp lệ. */
function spendStatPoint(char, stat) {
  const valid = ['str', 'int', 'vit', 'agi', 'wil'];
  if (!valid.includes(stat)) return null;
  if ((char.statPoints || 0) <= 0) return null;

  char.stats[stat]++;
  char.statPoints--;
  return { stat, value: char.stats[stat], remaining: char.statPoints };
}

/** Mốc được phép đổi class (DESIGN.md §3.2). */
const CLASS_CHANGE_LEVELS = [10, 25, 50];

module.exports = {
  MAX_LEVEL, STAT_POINTS_PER_LEVEL, CLASS_CHANGE_LEVELS,
  expToNext, addExp, loseExp, spendStatPoint,
};
