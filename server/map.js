'use strict';

const { MAP_W, MAP_H, TILE } = require('./config');

const TILE_FLOOR = 0;
const TILE_WALL = 1;

/**
 * Bản đồ sinh bằng code, MỘT BẢN CHO MỖI VÙNG.
 *
 * Hình dạng do `seed` của vùng quyết định, nên cùng một vùng luôn ra đúng một
 * bản đồ dù server khởi động lại bao nhiêu lần — người chơi nhớ được đường đi,
 * và hai người trong cùng vùng thấy y hệt nhau.
 *
 * Sau này khi có bản đồ vẽ tay (Tiled → JSON) thì thay ruột hàm `build`, phần
 * còn lại của game không phải sửa gì.
 */

/** PRNG 32-bit gọn, đủ tốt để rải khối đá và luôn cho ra cùng kết quả. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nền trống có viền tường — điểm xuất phát chung của mọi kiểu bản đồ. */
function blankWithBorder() {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      tiles[y * MAP_W + x] = border ? TILE_WALL : TILE_FLOOR;
    }
  }
  return tiles;
}

function buildWild(seed) {
  const rnd = mulberry32(seed);
  const tiles = blankWithBorder();

  // 7–10 khối đá rải rác. Chừa 2 ô quanh viền để không bịt kín lối đi ven tường.
  const count = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const bw = 3 + Math.floor(rnd() * 4);
    const bh = 2 + Math.floor(rnd() * 4);
    const bx = 3 + Math.floor(rnd() * (MAP_W - bw - 6));
    const by = 3 + Math.floor(rnd() * (MAP_H - bh - 6));

    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) tiles[y * MAP_W + x] = TILE_WALL;
    }
  }

  return tiles;
}

/** Quảng trường phải trống bao nhiêu ô quanh chỗ thương nhân đứng. */
const PLAZA_RADIUS = 5;

/**
 * Thị trấn: một quảng trường rộng, quanh rìa là xe hàng dựng thành cụm nhỏ.
 *
 * Khác hẳn bản đồ hoang: ở đây KHÔNG dùng khối đá to. Vùng an toàn là chỗ người
 * chơi mở túi ra sắp xếp đồ đạc và tìm ông bán hàng, nên thứ họ cần là nhìn
 * thông suốt, không phải mê cung. Ba luật giữ cho nó luôn đi lại được mà không
 * cần chạy thuật toán kiểm tra liên thông:
 *
 *   1. Cụm tối đa 2 ô — không cụm nào đủ dài để quây kín một góc.
 *   2. Chừa 2 ô sát viền, nên lúc nào cũng có một vòng hành lang chạy quanh.
 *   3. Chừa hẳn quảng trường quanh thương nhân, để không bao giờ có chuyện
 *      xe hàng mọc chồng lên đúng ô ông ta đứng.
 */
function buildTown(seed) {
  const rnd = mulberry32(seed);
  const tiles = blankWithBorder();

  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
  const nearPlaza = (x, y) => Math.abs(x - cx) <= PLAZA_RADIUS && Math.abs(y - cy) <= PLAZA_RADIUS;

  for (let i = 0; i < 22; i++) {
    const x = 3 + Math.floor(rnd() * (MAP_W - 6));
    const y = 3 + Math.floor(rnd() * (MAP_H - 6));
    if (nearPlaza(x, y)) continue;

    tiles[y * MAP_W + x] = TILE_WALL;

    // Một nửa số cụm là xe đôi, cho cái chợ khỏi đều tăm tắp như bàn cờ
    if (rnd() < 0.5) {
      const horiz = rnd() < 0.5;
      const x2 = x + (horiz ? 1 : 0);
      const y2 = y + (horiz ? 0 : 1);
      if (x2 < MAP_W - 3 && y2 < MAP_H - 3 && !nearPlaza(x2, y2)) {
        tiles[y2 * MAP_W + x2] = TILE_WALL;
      }
    }
  }

  return tiles;
}

/**
 * Một bản đồ đã dựng xong. Mọi hàm va chạm đóng trên `tiles` của chính nó —
 * hai vùng chạy song song không đụng dữ liệu của nhau.
 */
function makeMap(id, seed, kind = 'wild') {
  const tiles = kind === 'town' ? buildTown(seed) : buildWild(seed);

  const isWallTile = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return tiles[ty * MAP_W + tx] === TILE_WALL;
  };

  /**
   * Va chạm hình tròn với lưới ô vuông. Kiểm tra 4 điểm biên của hình tròn —
   * đủ chính xác khi bán kính nhân vật nhỏ hơn nửa ô.
   */
  const collides = (x, y, radius) => {
    const pts = [
      [x - radius, y], [x + radius, y],
      [x, y - radius], [x, y + radius],
    ];
    for (const [px, py] of pts) {
      if (isWallTile(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
    }
    return false;
  };

  /** Tìm một ô trống ngẫu nhiên để đặt nhân vật hoặc quái vào. */
  const randomSpawn = (radius) => {
    for (let i = 0; i < 200; i++) {
      const tx = 1 + Math.floor(Math.random() * (MAP_W - 2));
      const ty = 1 + Math.floor(Math.random() * (MAP_H - 2));
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (!collides(x, y, radius)) return { x, y };
    }
    return { x: TILE * 1.5, y: TILE * 1.5 };
  };

  return {
    id,
    tiles,
    isWallTile,
    collides,
    randomSpawn,
    /**
     * Vị trí đã lưu có còn đứng được không.
     *
     * Toạ độ lưu trong `characters.pos_x/pos_y` KHÔNG kèm theo vùng, mà mỗi
     * vùng một bản đồ với các khối đá ở chỗ khác nhau. Thoát ở giữa đồng cỏ rồi
     * vào thị trấn là toạ độ đó có thể rơi đúng vào một chiếc xe hàng — nhân
     * vật kẹt trong tường, đi hướng nào cũng bị va chạm chặn lại.
     */
    canStand: (x, y, radius) => x > 0 && y > 0 && !collides(x, y, radius),
    /** Gửi cho client một lần lúc vào phòng, không gửi lại mỗi tick. */
    serialize: () => ({ w: MAP_W, h: MAP_H, tile: TILE, data: Array.from(tiles) }),
  };
}

/** Bản đồ dựng một lần rồi dùng lại — mọi phòng cùng vùng chia sẻ đúng một bản. */
const cache = new Map();

function forZone(zone) {
  if (!cache.has(zone.id)) {
    cache.set(zone.id, makeMap(zone.id, zone.seed, zone.safe ? 'town' : 'wild'));
  }
  return cache.get(zone.id);
}

module.exports = { TILE_FLOOR, TILE_WALL, PLAZA_RADIUS, forZone, makeMap };
