'use strict';

/**
 * Icon từ game-icons.net (CC BY 3.0 — xem CREDITS.md).
 *
 * Cả bộ nằm trong MỘT file sprite `public/img/icons.svg`, tải một lần rồi nhét
 * vào DOM. Nhét vào chính trang thay vì trỏ `<use href="/img/icons.svg#...">`
 * là có lý do: tham chiếu ra file ngoài thì `currentColor` không ăn theo màu
 * chữ ở nhiều trình duyệt, mà cả cách dùng icon ở đây dựa vào đúng chỗ đó —
 * cùng một hình cái kiếm phải đổi màu theo hạng đồ.
 */

const Icons = (() => {
  const SPRITE = '/img/icons.svg?v=20';
  let loading = null;

  function load() {
    if (loading) return loading;
    loading = fetch(SPRITE)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
      .then((txt) => {
        const box = document.createElement('div');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        box.innerHTML = txt;
        document.body.appendChild(box);
      })
      // Thiếu icon thì giao diện xấu đi chứ không được sập: mọi chỗ gọi đều có
      // phương án chữ dự phòng
      .catch((e) => console.warn('[icons] không tải được sprite:', e.message));
    return loading;
  }

  function has(key) {
    return !!document.getElementById(`gi-${key}`);
  }

  /** Chuỗi HTML của một icon. `fallback` hiện khi sprite chưa về hoặc thiếu hình. */
  function svg(key, { cls = '', fallback = '' } = {}) {
    if (!has(key)) return fallback;
    return `<svg class="gi ${cls}" aria-hidden="true"><use href="#gi-${key}"></use></svg>`;
  }

  /**
   * Thay mọi phần tử `data-icon="..."` trong `root` bằng icon tương ứng.
   *
   * Dùng cho những chỗ nằm sẵn trong index.html. Nội dung cũ (emoji, ký tự) giữ
   * nguyên làm phương án dự phòng cho tới lúc thay được.
   */
  function paint(root = document) {
    for (const el of root.querySelectorAll('[data-icon]')) {
      const key = el.getAttribute('data-icon');
      if (!has(key) || el.dataset.painted) continue;
      el.innerHTML = svg(key, { cls: el.dataset.iconClass || '' });
      el.dataset.painted = '1';
    }
  }

  return { load, paint, svg, has };
})();
