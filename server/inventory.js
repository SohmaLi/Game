'use strict';

const items = require('./data/items');

/**
 * Túi đồ và trang bị đang mặc.
 *
 * Hiện lưu trong RAM theo phiên chơi. Khi làm màn đăng nhập (giai đoạn cuối)
 * sẽ đổ xuống MySQL — cấu trúc dữ liệu ở đây đã tính sẵn cho việc đó nên
 * không phải viết lại.
 */

const BAG_SIZE = 40;

function create() {
  const equipped = {};
  for (const id of items.SLOT_IDS) equipped[id] = null;
  return { equipped, bag: [] };
}

function bagFull(inv) {
  return inv.bag.length >= BAG_SIZE;
}

/** Trả về false nếu túi đầy — món đồ bị mất, cố ý không tự bán hộ người chơi. */
function addItem(inv, item) {
  if (bagFull(inv)) return false;
  inv.bag.push(item);
  return true;
}

function findInBag(inv, uid) {
  return inv.bag.find((i) => i.uid === uid) || null;
}

/**
 * Mặc đồ. Nhẫn lắp được vào cả hai ô nên cần chỉ rõ ô đích; các món khác thì
 * tự suy ra từ chính món đồ.
 */
function equip(inv, uid, slotId = null) {
  const item = findInBag(inv, uid);
  if (!item) return { ok: false, error: 'Không tìm thấy món đồ.' };

  const target = slotId || (item.slot === 'ring' ? firstFreeRing(inv) : item.slot);
  if (!items.SLOT_IDS.includes(target)) return { ok: false, error: 'Ô trang bị không hợp lệ.' };
  if (!items.fitsSlot(item, target)) return { ok: false, error: 'Món này không lắp vào ô đó được.' };

  // Đổi chỗ: món đang mặc quay về túi
  const current = inv.equipped[target];
  inv.bag = inv.bag.filter((i) => i.uid !== uid);
  inv.equipped[target] = item;
  if (current) inv.bag.push(current);

  return { ok: true, equipped: item, unequipped: current || null };
}

function firstFreeRing(inv) {
  return inv.equipped.ring1 ? 'ring2' : 'ring1';
}

function unequip(inv, slotId) {
  const item = inv.equipped[slotId];
  if (!item) return { ok: false, error: 'Ô đó đang trống.' };
  if (bagFull(inv)) return { ok: false, error: 'Túi đã đầy.' };

  inv.equipped[slotId] = null;
  inv.bag.push(item);
  return { ok: true, unequipped: item };
}

function discard(inv, uid) {
  const before = inv.bag.length;
  inv.bag = inv.bag.filter((i) => i.uid !== uid);
  return inv.bag.length < before;
}

/**
 * Vứt nhiều món cùng lúc.
 *
 * Chỉ đụng tới TÚI ĐỒ, không bao giờ đụng tới đồ đang mặc: người chơi tick chọn
 * mười mấy ô rồi bấm xoá, mà một cái tick lỡ tay lại lột luôn món đang mặc trên
 * người thì không có đường cứu. Muốn vứt đồ đang mặc thì phải tháo ra trước.
 *
 * Trả về danh sách món ĐÃ vứt để client báo đúng số lượng — client tự đếm thì
 * sai ngay khi có uid không tồn tại lẫn vào.
 */
function discardMany(inv, uids) {
  const wanted = new Set(Array.isArray(uids) ? uids : []);
  if (!wanted.size) return { ok: false, error: 'Chưa chọn món nào.' };

  const removed = inv.bag.filter((i) => wanted.has(i.uid));
  if (!removed.length) return { ok: false, error: 'Không tìm thấy món nào trong túi.' };

  inv.bag = inv.bag.filter((i) => !wanted.has(i.uid));
  return { ok: true, removed: removed.map((i) => ({ uid: i.uid, name: i.name, rarity: i.rarity })) };
}

/**
 * Cộng dồn toàn bộ trang bị đang mặc thành một bảng cộng thêm.
 *
 * Trả về hai nhóm tách biệt:
 *   stats   — cộng thẳng vào 5 chỉ số gốc, rồi mới chạy qua công thức
 *   combat  — hệ số nhân/cộng áp lên chỉ số chiến đấu đã tính xong
 *
 * Tách vậy vì "+5 Thể Chất" và "+8% Giáp" hoạt động khác nhau: cái đầu đi qua
 * công thức (nên cũng làm tăng máu), cái sau chỉ chạm vào giáp.
 */
function bonuses(inv) {
  const stats = { str: 0, int: 0, vit: 0, agi: 0, wil: 0 };
  const combat = {
    critChance: 0, critDamage: 0, dodge: 0,
    armorPercent: 0, resistPercent: 0, hpPercent: 0,
    regenPercent: 0, manaRegen: 0, reflect: 0, lifesteal: 0,
  };

  for (const slotId of items.SLOT_IDS) {
    const item = inv.equipped[slotId];
    if (!item) continue;

    for (const [k, v] of Object.entries(item.stats || {})) {
      if (k in stats) stats[k] += v;
    }
    for (const p of item.passives || []) {
      for (const [k, v] of Object.entries(p.effect || {})) {
        if (k in combat) combat[k] += v;
      }
    }
  }

  return { stats, combat };
}

/**
 * Liệt kê mọi bị động đang có hiệu lực, kèm món đồ đã mang lại nó.
 *
 * Cần thiết vì bị động nằm rải trên 10 món — người chơi không có cách nào biết
 * mình đang thật sự được hưởng những gì nếu phải mở từng món ra xem. Trùng tên
 * thì cộng dồn giá trị và ghi nhiều nguồn.
 */
function activePassives(inv) {
  const byName = new Map();

  for (const slotId of items.SLOT_IDS) {
    const item = inv.equipped[slotId];
    if (!item) continue;

    for (const p of item.passives || []) {
      const entry = byName.get(p.name) || { name: p.name, desc: p.desc, sources: [], effect: {} };
      entry.sources.push(item.name);
      for (const [k, v] of Object.entries(p.effect || {})) {
        entry.effect[k] = (entry.effect[k] || 0) + v;
      }
      byName.set(p.name, entry);
    }
  }

  return [...byName.values()].map((e) => ({
    name: e.name,
    desc: e.desc,
    sources: e.sources,
    stacks: e.sources.length,
    // Quy đổi thành chuỗi đọc được: hầu hết bị động là phần trăm
    value: Object.entries(e.effect)
      .map(([k, v]) => (k === 'manaRegen' ? `+${v}` : `+${Math.round(v * 100)}%`))
      .join(' · '),
  }));
}

/** Điểm sức mạnh thô, chỉ để so sánh nhanh hai món trong giao diện. */
function itemScore(item) {
  if (!item) return 0;
  const statSum = Object.values(item.stats || {}).reduce((a, b) => a + b, 0);
  return statSum + (item.passives?.length || 0) * 8;
}

module.exports = {
  BAG_SIZE, create, addItem, equip, unequip, discard, discardMany, findInBag, bonuses, activePassives,
  itemScore, bagFull,
};
