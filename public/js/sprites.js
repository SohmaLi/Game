'use strict';

/**
 * Sprite từ pack Ninja Adventure của Pixel-Boy (CC0 — xem CREDITS.md).
 *
 * Cả bộ nằm trong MỘT ảnh `public/img/atlas.png` kèm bảng toạ độ `atlas.json`,
 * do `tools/build-sprites.js` sinh ra. Ở đây chỉ có việc tra bảng rồi
 * `drawImage`.
 *
 * Nguyên tắc: **thiếu sprite thì vẽ hình cũ, không được để trống**. Ảnh có thể
 * chưa tải xong ở khung hình đầu tiên, mà bản đồ thì vẽ 60 lần mỗi giây — mọi
 * hàm ở đây trả về `false` khi chưa sẵn sàng để chỗ gọi tự lo phương án dự phòng.
 */

const Sprites = (() => {
  /**
   * Phiên bản lấy thẳng từ thẻ `<script>` của chính file này.
   *
   * `atlas.png` và `atlas.json` là MỘT CẶP: bảng toạ độ chỉ đúng với đúng cái
   * ảnh sinh ra cùng lúc với nó. Trước đây chỗ này ghi cứng `?v=21` tách rời
   * `?v=N` của index.html, nên bump index.html mà quên chỗ này là trình duyệt
   * ghép JSON MỚI với PNG CŨ còn trong cache — toạ độ ô nền rơi trúng hàng vật
   * cản, cả bản đồ hoá thành bụi cây. Đọc từ `src` của chính mình thì hai file
   * luôn bị bust cùng lúc, không bao giờ lệch nhau được nữa.
   */
  const VER = new URL(document.currentScript.src, location.href).searchParams.get('v');
  const q = VER ? `?v=${encodeURIComponent(VER)}` : '';

  const PNG = `/img/atlas.png${q}`;
  const JSON_URL = `/img/atlas.json${q}`;

  /** Cột trong một khối = hướng nhìn. Thứ tự do pack quy định, đừng đổi. */
  const DIR_COL = { down: 0, up: 1, left: 2, right: 3 };

  /** Một bước chân mất bao lâu. 140ms cho dáng đi vừa phải ở tốc độ 150px/s. */
  const STEP_MS = 140;

  let img = null;
  let man = null;
  let loading = null;

  function load() {
    if (loading) return loading;
    loading = Promise.all([
      fetch(JSON_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
      new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('không tải được atlas.png'));
        el.src = PNG;
      }),
    ])
      .then(([m, el]) => { man = m; img = el; })
      // Hỏng thì game vẫn chạy với hình tròn như trước, chỉ xấu đi
      .catch((e) => console.warn('[sprites] không dùng được atlas:', e.message));
    return loading;
  }

  const ready = () => !!(img && man);

  /* ---------------------------------------------- tra bảng ------------- */

  /**
   * Khối hình của một người chơi.
   *
   * Cùng lớp thì cùng hình — nhìn phát biết ai là Chiến Binh, ai là Pháp Sư.
   * Chưa chọn lớp thì rải đều vào nhóm phụ theo tên, để một đám người mới trong
   * cùng một vùng không phải là bảy bản sao của nhau.
   */
  function charBlock(className, name) {
    if (!ready()) return null;
    if (className && man.chars[className]) return man.chars[className];
    const keys = Object.keys(man.chars).filter((k) => k.startsWith('other'));
    if (!keys.length) return man.chars.none || null;
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return man.chars[keys[h % keys.length]];
  }

  const mobBlock = (defId) => (ready() ? man.mobs[defId] || null : null);
  /** Người bán hàng tra bảng RIÊNG, không dùng chung với quái. */
  const npcBlock = (spriteId) => (ready() ? man.npcs?.[spriteId] || null : null);
  const zone = (zoneId) => (ready() ? man.zones[zoneId] || null : null);

  /** Khung hoạt cảnh theo đồng hồ. Đứng yên thì luôn là khung 0 (dáng đứng). */
  function walkFrame(moving, seed = 0) {
    if (!moving) return 0;
    return Math.floor((Date.now() + seed) / STEP_MS) % (man?.walk || 4);
  }

  /* ---------------------------------------------- vẽ ------------------- */

  /**
   * Vẽ một khối nhân vật/quái, CĂN THEO CHÂN chứ không theo tâm.
   *
   * Server coi nhân vật là một hình tròn quanh tâm, còn mắt người nhìn nhân vật
   * đứng trên mặt đất. Lấy tâm ô sprite trùng tâm hình tròn thì trông như đang
   * lơ lửng; hạ xuống một chút để chân chạm đúng chỗ cái bóng.
   */
  function drawUnit(ctx, block, dir, frame, cx, cy, size) {
    if (!ready() || !block) return false;
    const c = man.cell;
    const col = DIR_COL[dir] ?? 0;
    const row = Math.max(0, Math.min((man.walk || 4) - 1, frame | 0));
    ctx.drawImage(
      img,
      block.x + col * c, block.y + row * c, c, c,
      Math.round(cx - size / 2), Math.round(cy - size * 0.62), size, size,
    );
    return true;
  }

  /** Cứ khoảng bao nhiêu ô nền thì chèn một ô có hoa/vết nứt cho đỡ đơn điệu. */
  const VARIANT_EVERY = 11;

  /**
   * Ô nền. `noise` là số cố định theo toạ độ ô, để cùng một chỗ luôn ra cùng
   * một hình — bốc lại mỗi khung hình thì cả bãi cỏ nhấp nháy.
   *
   * Biến thể phải HIẾM. Rải đều ba hình thì hai phần ba mặt đất lấm tấm hoa và
   * đá, nhìn rối đến mức không thấy con quái đứng ở đâu. Điểm nhấn chỉ là điểm
   * nhấn khi nó thưa.
   */
  function drawGround(ctx, zoneId, noise, dx, dy, size) {
    const z = zone(zoneId);
    if (!z) return false;
    const c = man.cell;
    const extra = z.ground.n - 1;
    const i = extra > 0 && noise % VARIANT_EVERY === 0 ? 1 + (noise % extra) : 0;
    ctx.drawImage(img, z.ground.x + i * c, z.ground.y, c, c, dx, dy, size, size);
    return true;
  }

  /** Vật cản của vùng (cây, tảng đá…) — vẽ ĐÈ lên nền, không thay nền. */
  function drawProp(ctx, zoneId, dx, dy, size) {
    const z = zone(zoneId);
    if (!z) return false;
    const p = z.prop;
    ctx.drawImage(img, p.x, p.y, p.w, p.h, dx, dy, size, size);
    return true;
  }

  /**
   * Toạ độ nền CSS để dùng chính atlas này làm ảnh nền cho một thẻ HTML.
   * Màn chiến đấu cần thứ này: nó dựng bằng DOM chứ không phải canvas.
   */
  function cssFrame(block, dir = 'down', scale = 3) {
    if (!ready() || !block) return null;
    const c = man.cell;
    const col = DIR_COL[dir] ?? 0;
    return {
      backgroundImage: `url(${PNG})`,
      backgroundSize: `${img.width * scale}px ${img.height * scale}px`,
      backgroundPosition: `-${(block.x + col * c) * scale}px -${block.y * scale}px`,
      width: `${c * scale}px`,
      height: `${c * scale}px`,
    };
  }

  return { load, ready, charBlock, mobBlock, npcBlock, zone, walkFrame, drawUnit, drawGround, drawProp, cssFrame };
})();
