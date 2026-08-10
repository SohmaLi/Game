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

function build(seed) {
  const rnd = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      tiles[y * MAP_W + x] = border ? TILE_WALL : TILE_FLOOR;
    }
  }

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

/**
 * Một bản đồ đã dựng xong. Mọi hàm va chạm đóng trên `tiles` của chính nó —
 * hai vùng chạy song song không đụng dữ liệu của nhau.
 */
function makeMap(id, seed) {
  const tiles = build(seed);

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
    /** Gửi cho client một lần lúc vào phòng, không gửi lại mỗi tick. */
    serialize: () => ({ w: MAP_W, h: MAP_H, tile: TILE, data: Array.from(tiles) }),
  };
}

/** Bản đồ dựng một lần rồi dùng lại — mọi phòng cùng vùng chia sẻ đúng một bản. */
const cache = new Map();

function forZone(zone) {
  if (!cache.has(zone.id)) cache.set(zone.id, makeMap(zone.id, zone.seed));
  return cache.get(zone.id);
}

module.exports = { TILE_FLOOR, TILE_WALL, forZone, makeMap };
