'use strict';

const { MAP_W, MAP_H, TILE } = require('./config');

const TILE_FLOOR = 0;
const TILE_WALL = 1;

/**
 * Bản đồ tạm thời, sinh bằng code để có cái chạy ngay.
 * Sau này khi chốt chủ đề game sẽ thay bằng tilemap vẽ tay (Tiled -> JSON).
 *
 * Bản đồ là dữ liệu dùng chung cho mọi phòng nên chỉ sinh một lần.
 */
function buildMap() {
  const tiles = new Uint8Array(MAP_W * MAP_H);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      tiles[y * MAP_W + x] = border ? TILE_WALL : TILE_FLOOR;
    }
  }

  // Vài khối chướng ngại để thấy rõ va chạm có hoạt động không
  const blocks = [
    [8, 6, 5, 3], [26, 6, 5, 3],
    [8, 20, 5, 3], [26, 20, 5, 3],
    [18, 13, 4, 4],
  ];
  for (const [bx, by, bw, bh] of blocks) {
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) {
          tiles[y * MAP_W + x] = TILE_WALL;
        }
      }
    }
  }

  return tiles;
}

const tiles = buildMap();

function isWallTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return tiles[ty * MAP_W + tx] === TILE_WALL;
}

/**
 * Va chạm hình tròn với lưới ô vuông. Kiểm tra 4 điểm biên của hình tròn —
 * đủ chính xác khi bán kính nhân vật nhỏ hơn nửa ô.
 */
function collides(x, y, radius) {
  const pts = [
    [x - radius, y], [x + radius, y],
    [x, y - radius], [x, y + radius],
  ];
  for (const [px, py] of pts) {
    if (isWallTile(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
  }
  return false;
}

/** Tìm một ô trống ngẫu nhiên để đặt người chơi mới vào. */
function randomSpawn(radius) {
  for (let i = 0; i < 200; i++) {
    const tx = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const ty = 1 + Math.floor(Math.random() * (MAP_H - 2));
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    if (!collides(x, y, radius)) return { x, y };
  }
  return { x: TILE * 1.5, y: TILE * 1.5 };
}

module.exports = {
  TILE_FLOOR,
  TILE_WALL,
  tiles,
  collides,
  randomSpawn,
  /** Gửi cho client một lần lúc vào phòng, không gửi lại mỗi tick. */
  serialize: () => ({ w: MAP_W, h: MAP_H, tile: TILE, data: Array.from(tiles) }),
};
