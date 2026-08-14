#!/usr/bin/env node
'use strict';

/**
 * Dựng lại `public/img/atlas.png` + `public/img/atlas.json` từ pack
 * **Ninja Adventure** của Pixel-Boy (CC0 — xem CREDITS.md).
 *
 *     node tools/build-sprites.js
 *
 * Cùng một lý do với tools/build-icons.js: chỉ tải về đúng những khung hình game
 * dùng tới, gộp thành MỘT file, rồi commit kết quả. Deploy không cần mạng, và
 * trình duyệt tải một ảnh thay vì bốn chục ảnh.
 *
 * Muốn đổi hình cho một con quái hay một vùng thì sửa đúng một dòng trong bảng
 * `WANT` bên dưới rồi chạy lại. Không phải đụng vào code game.
 *
 * Bố cục gốc của pack:
 *   - characters/N.png  64×112 — 4 cột = 4 hướng (xuống, lên, trái, phải),
 *                                các hàng là khung hoạt cảnh
 *   - monsters/N.png    64×64  — cùng quy ước, 4 hàng
 *   - background-elements/tileset.png  448×640, ô 16px
 *
 * Bốn hàng ĐẦU của cả hai loại là chu kỳ đi: đứng · bước · đứng · bước chân kia.
 * Chỉ lấy chừng đó, phần còn lại (đòn đánh, pose đặc biệt) chưa dùng tới.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/ninja-adventure';
const OUT_PNG = path.join(__dirname, '..', 'public', 'img', 'atlas.png');
const OUT_JSON = path.join(__dirname, '..', 'public', 'img', 'atlas.json');

const CELL = 16;   // một ô gốc của pack
const WALK = 4;    // số khung trong chu kỳ đi
const DIRS = 4;    // xuống · lên · trái · phải

/* ------------------------------------------------------------------ BẢNG --- */

/** Nhân vật người chơi. `class:` khớp với id lớp trong server/data/classes.js. */
const CHARS = {
  warrior: 15,   // kỵ sĩ giáp sắt
  mage: 9,       // ông già tóc bạc
  none: 1,       // ninja xanh — chưa chọn lớp
  // Người chơi khác lấy một hình trong nhóm này theo tên, để không ai giống ai
  other1: 2, other2: 3, other3: 5, other4: 6, other5: 12, other6: 17, other7: 25,
};

/**
 * Quái. Số dương = `monsters/N.png`, số âm = `characters/N.png` (những con
 * hình người: cướp đường, bộ xương).
 */
const MOBS = {
  grey_wolf: 11,
  bandit: -13,          // tên đội mũ đen khăn đỏ
  skeleton: -23,        // bộ xương trắng
  mist_spider: 1,
  bone_archer: 19,
  frost_revenant: 7,    // bóng ma trắng
  storm_cultist: 20,
  cliff_bear: 8,
  alpha_wolf: 14,
  spider_matron: 9,
  bone_general: 5,
  ice_troll: 17,
  storm_herald: 13,
  void_wraith: -8,       // lính giáp lửa
  void_eye: 16,          // cầu gai tối màu
  void_lord: -4,         // áo choàng tím có huy hiệu lửa
};

/**
 * Người không đánh nhau. Cùng bố cục 4 hướng × 4 khung như nhân vật người chơi,
 * chỉ khác chỗ tra bảng — để `Sprites` không bao giờ lỡ tay lấy hình ông bán
 * hàng ra vẽ cho một con quái.
 */
const NPCS = {
  merchant: 14,   // mũ rộng vành, áo khoác đi đường — dân buôn đường dài
  scribe: 10,     // râu dài, khăn buộc trán, áo chùng — người chép sử
};

/**
 * Ô nền và vật cản của từng vùng. Toạ độ tính theo ô 16px trong tileset.
 *
 * Ô biến thể phải CÙNG TÔNG với ô nền — chỉ khác ở chi tiết trang trí (bông
 * hoa, vết nứt). Lấy một ô xanh khác sắc độ làm biến thể thì mỗi lần nó xuất
 * hiện là một miếng vá vuông vức hiện rõ giữa thảm cỏ. Vùng nào không tìm được
 * ô cùng tông thì để nền trơn, thà đơn điệu còn hơn lỗ chỗ.
 */
const ZONE_TILES = {
  duskmoor:  { ground: [26, 11], variants: [[27, 11]],           prop: [5, 8] },    // đá lát quảng trường · xe hàng
  meadow:    { ground: [14, 16], variants: [[13, 16], [16, 16]], prop: [0, 10] },   // cỏ · cây
  mistwood:  { ground: [23, 11], variants: [],                   prop: [6, 10] },   // cỏ sẫm · thông
  bonewaste: { ground: [23, 13], variants: [[24, 12], [24, 13]], prop: [12, 10] },  // cát · tảng đá
  frostmaw:  { ground: [14, 19], variants: [[13, 19], [16, 19]], prop: [0, 22] },   // tuyết · thông phủ tuyết
  stormpeak: { ground: [16, 30], variants: [],                   prop: [2, 27] },   // đá tím · cây chết
  voidshrine: { ground: [23, 32], variants: [],                  prop: [8, 25] },   // nền phế tích rêu phong · đá tối
};

/* -------------------------------------------------------------- PNG I/O --- */

/**
 * Đọc/ghi PNG bằng tay thay vì kéo về một thư viện.
 *
 * Dự án này cố ý không có bước build và chỉ có 4 dependency chạy thật. Thêm
 * `sharp` hay `pngjs` chỉ để chạy MỘT công cụ offline là cái giá không đáng —
 * PNG màu thật 8-bit đọc ghi được trong khoảng trăm dòng bằng `zlib` có sẵn.
 */

function readChunks(buf) {
  const chunks = [];
  let p = 8; // bỏ qua chữ ký
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    chunks.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
}

/** Trả về { w, h, px } với px là RGBA thô. */
function decodePng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8 || interlace !== 0) {
    throw new Error(`PNG lạ: depth=${depth} interlace=${interlace}`);
  }

  const plte = chunks.find((c) => c.type === 'PLTE')?.data || null;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data || null;

  // 0=xám 2=RGB 3=bảng màu 4=xám+alpha 6=RGBA
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels == null) throw new Error(`colorType ${colorType} chưa hỗ trợ`);

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);

  const bpp = channels;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);

  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
  }

  // Quy về RGBA
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp;
    const d = i * 4;
    if (colorType === 6) { out.copy(px, d, s, s + 4); }
    else if (colorType === 2) { out.copy(px, d, s, s + 3); px[d + 3] = 255; }
    else if (colorType === 0) { px[d] = px[d + 1] = px[d + 2] = out[s]; px[d + 3] = 255; }
    else if (colorType === 4) { px[d] = px[d + 1] = px[d + 2] = out[s]; px[d + 3] = out[s + 1]; }
    else if (colorType === 3) {
      const idx = out[s];
      px[d] = plte[idx * 3]; px[d + 1] = plte[idx * 3 + 1]; px[d + 2] = plte[idx * 3 + 2];
      px[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { w, h, px };
}

function encodePng(w, h, px) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter 0: đủ tốt, ảnh này nhỏ
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* -------------------------------------------------------------- dựng ảnh --- */

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4); // trong suốt hoàn toàn
  }

  /** Chép nguyên khối, KHÔNG trộn alpha — nguồn và đích không bao giờ chồng nhau. */
  blit(src, sx, sy, sw, sh, dx, dy) {
    for (let y = 0; y < sh; y++) {
      const s = ((sy + y) * src.w + sx) * 4;
      const d = ((dy + y) * this.w + dx) * 4;
      src.px.copy(this.px, d, s, s + sw * 4);
    }
  }
}

async function fetchPng(rel) {
  const res = await fetch(`${BASE}/${rel}`);
  if (!res.ok) throw new Error(`${rel} → HTTP ${res.status}`);
  return decodePng(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  console.log('==> Tải hình từ kho Superpowers (Pixel-Boy, CC0)');

  const need = new Set();
  for (const n of Object.values(CHARS)) need.add(`characters/${n}.png`);
  for (const n of Object.values(NPCS)) need.add(`characters/${n}.png`);
  for (const n of Object.values(MOBS)) need.add(n < 0 ? `characters/${-n}.png` : `monsters/${n}.png`);
  need.add('background-elements/tileset.png');

  const src = new Map();
  for (const rel of need) {
    src.set(rel, await fetchPng(rel));
    process.stdout.write('.');
  }
  console.log(` ${src.size} file`);

  /**
   * Xếp theo hàng: mỗi khối nhân vật/quái là 64×64 (4 hướng × 4 khung), 8 khối
   * một hàng. Ô nền và vật cản xếp riêng ở dưới. Cách xếp đơn giản thế này thừa
   * vài trăm pixel trống, đổi lại đọc bảng toạ độ là hiểu ngay.
   */
  const BLOCK = CELL * WALK;              // 64
  const PER_ROW = 8;
  const units = [
    ...Object.keys(CHARS).map((k) => ['char', k, CHARS[k]]),
    ...Object.keys(NPCS).map((k) => ['npc', k, NPCS[k]]),
    ...Object.keys(MOBS).map((k) => ['mob', k, MOBS[k]]),
  ];
  const unitRows = Math.ceil(units.length / PER_ROW);

  const zones = Object.keys(ZONE_TILES);
  const tilesPerZone = 1 + Math.max(...zones.map((z) => ZONE_TILES[z].variants.length));
  const groundY = unitRows * BLOCK;
  const propY = groundY + zones.length * CELL;
  const atlasW = Math.max(PER_ROW * BLOCK, tilesPerZone * CELL, zones.length * CELL * 2);
  const atlasH = propY + CELL * 2;

  const atlas = new Canvas(atlasW, atlasH);
  const man = { cell: CELL, walk: WALK, dirs: DIRS, chars: {}, npcs: {}, mobs: {}, zones: {} };

  units.forEach(([kind, key, n], i) => {
    const rel = n < 0 ? `characters/${-n}.png` : (kind === 'mob' ? `monsters/${n}.png` : `characters/${n}.png`);
    const im = src.get(rel);
    const dx = (i % PER_ROW) * BLOCK;
    const dy = Math.floor(i / PER_ROW) * BLOCK;
    // 4 cột × 4 hàng đầu: chu kỳ đi của cả bốn hướng
    atlas.blit(im, 0, 0, BLOCK, Math.min(BLOCK, im.h), dx, dy);
    man[{ char: 'chars', npc: 'npcs', mob: 'mobs' }[kind]][key] = { x: dx, y: dy };
  });

  const ts = src.get('background-elements/tileset.png');
  zones.forEach((z, zi) => {
    const { ground, variants, prop } = ZONE_TILES[z];
    const tiles = [ground, ...variants];
    tiles.forEach(([c, r], ti) => atlas.blit(ts, c * CELL, r * CELL, CELL, CELL, ti * CELL, groundY + zi * CELL));
    atlas.blit(ts, prop[0] * CELL, prop[1] * CELL, CELL * 2, CELL * 2, zi * CELL * 2, propY);
    man.zones[z] = {
      ground: { x: 0, y: groundY + zi * CELL, n: tiles.length },
      prop: { x: zi * CELL * 2, y: propY, w: CELL * 2, h: CELL * 2 },
    };
  });

  fs.writeFileSync(OUT_PNG, encodePng(atlas.w, atlas.h, atlas.px));
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(man, null, 2)}\n`);

  console.log(`==> ${OUT_PNG} — ${atlas.w}×${atlas.h}, ${(fs.statSync(OUT_PNG).size / 1024).toFixed(0)} KB`);
  console.log(`    ${Object.keys(man.chars).length} nhân vật · ${Object.keys(man.npcs).length} NPC`
    + ` · ${Object.keys(man.mobs).length} quái · ${zones.length} vùng`);
  console.log('    Nhớ bump ?v=N trong public/index.html');
}

main().catch((err) => {
  console.error('THẤT BẠI:', err.message);
  process.exit(1);
});
