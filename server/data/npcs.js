'use strict';

const { TILE } = require('../config');

/**
 * Người không đánh nhau — hiện có thương nhân và người chép sử ở Bến Cảng Duskmoor.
 *
 * NPC KHÔNG phải là quái nhẹ đô: nó không nằm trong `room.mobs()`, không đi lại,
 * không bao giờ kéo ai vào trận. Trộn chung vào bộ máy quái để "đỡ phải viết
 * thêm" là cách chắc chắn nhất để một ngày nào đó `checkEncounters` lôi người
 * chơi vào trận với ông bán hàng.
 *
 * Vị trí ghi bằng Ô, không phải pixel: bản đồ thị trấn dựng theo lưới ô nên đặt
 * theo ô là thứ duy nhất kiểm chứng được bằng mắt trên `server/map.js`. Ô này
 * phải luôn là ô trống — `buildTown` chừa sẵn cả quảng trường quanh nó.
 *
 * `kind` quyết định bấm E ra cửa sổ nào. Không suy ra từ `id`: một ngày có hai
 * ông bán hàng ở hai vùng là chỗ suy diễn đó sai, mà sai lặng lẽ.
 */

const NPCS = [
  {
    id: 'merchant',
    name: 'Ganne Vạn Hải',
    role: 'Thương nhân',
    kind: 'shop',
    sprite: 'merchant',
    /** Chính giữa quảng trường. Xem `buildTown` trong server/map.js. */
    tile: { x: 20, y: 15 },
    greet: 'Đồ của cậu, vàng của tôi. Hoặc ngược lại — tôi không kén.',
  },
  {
    id: 'scribe',
    name: 'Orin Bút Sắt',
    role: 'Người Chép Sử',
    kind: 'quest',
    sprite: 'scribe',
    /**
     * Cách thương nhân 4 ô — xa hơn `TALK_RADIUS` gấp đôi. Hai người đứng sát
     * nhau thì `updateNearNpc` ở client lấy người ĐẦU DANH SÁCH trong tầm, và
     * người chơi bấm E ra cửa hàng trong khi đang định giao nhiệm vụ.
     */
    tile: { x: 24, y: 15 },
    greet: 'Việc ngoài kia ta ghi cả. Ngươi làm tới đâu, sổ này biết tới đó.',
  },
];

const BY_ID = new Map(NPCS.map((n) => [n.id, n]));

/**
 * Bao xa thì nói chuyện được. Rộng hơn bán kính người chơi kha khá: phải đứng
 * ĐÚNG một pixel mới bấm được thì người chơi tưởng nút hỏng.
 */
const TALK_RADIUS = TILE * 1.75;

/** Dựng bản đặt trên bản đồ của một vùng, kèm toạ độ pixel. */
function forZone(zone) {
  return (zone.npcs || []).map((id) => {
    const def = BY_ID.get(id);
    if (!def) throw new Error(`Vùng ${zone.id} trỏ tới NPC không có thật: ${id}`);
    return {
      ...def,
      x: def.tile.x * TILE + TILE / 2,
      y: def.tile.y * TILE + TILE / 2,
    };
  });
}

const inTalkRange = (npc, p) => Math.hypot(npc.x - p.x, npc.y - p.y) <= TALK_RADIUS;

module.exports = { NPCS, TALK_RADIUS, forZone, inTalkRange, get: (id) => BY_ID.get(id) || null };
