'use strict';

/**
 * Thành phần giao diện dùng chung: menu chuột phải, hộp xác nhận, cửa sổ chi tiết.
 *
 * Chuột phải bị chặn trên toàn bộ khu vực game để nhường chỗ cho menu riêng.
 * Ngoại lệ: ô nhập liệu vẫn giữ menu của trình duyệt — người chơi cần copy/paste
 * khi gõ tên nhân vật, cướp mất cái đó là gây khó chịu vô cớ.
 */

const UI = (() => {
  let ctxEl = null;
  let modalEl = null;

  /* ------------------------------------------------ khởi tạo ---------- */

  function init() {
    document.addEventListener('contextmenu', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      e.preventDefault();
    });

    // Bấm ra ngoài, cuộn trang, hoặc Esc thì đóng menu
    document.addEventListener('mousedown', (e) => {
      if (ctxEl && !ctxEl.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
  }

  /* ------------------------------------------------ menu ngữ cảnh ----- */

  /**
   * @param e      sự kiện chuột, dùng để đặt vị trí
   * @param opts.title / opts.subtitle  phần đầu menu
   * @param opts.items  [{ label, icon, danger, disabled, onClick }] · null = đường kẻ
   */
  function menu(e, opts) {
    closeMenu();

    const el = document.createElement('div');
    el.className = 'ctx';

    if (opts.title) {
      const head = document.createElement('div');
      head.className = 'ctx-head';
      head.innerHTML = `<div class="ctx-title" style="color:${opts.color || '#e6e9ef'}">${esc(opts.title)}</div>
        ${opts.subtitle ? `<div class="ctx-sub">${esc(opts.subtitle)}</div>` : ''}`;
      el.appendChild(head);
    }

    for (const item of opts.items) {
      if (!item) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        el.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = `ctx-item ${item.danger ? 'danger' : ''}`;
      btn.disabled = !!item.disabled;
      btn.innerHTML = `<span class="ctx-icon">${item.icon || ''}</span><span>${esc(item.label)}</span>`;
      btn.onclick = () => {
        closeMenu();
        item.onClick?.();
      };
      el.appendChild(btn);
    }

    document.body.appendChild(el);
    ctxEl = el;

    // Lật vào trong khi sát mép màn hình, tránh menu bị cắt mất
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = e.clientX + w + 8 > window.innerWidth ? e.clientX - w : e.clientX;
    const y = e.clientY + h + 8 > window.innerHeight ? window.innerHeight - h - 8 : e.clientY;
    el.style.left = `${Math.max(6, x)}px`;
    el.style.top = `${Math.max(6, y)}px`;
  }

  function closeMenu() {
    ctxEl?.remove();
    ctxEl = null;
  }

  /* ------------------------------------------------ hộp xác nhận ------ */

  /**
   * Trả về Promise<boolean>. Dùng cho mọi hành động không hoàn tác được.
   */
  function confirm(opts) {
    return new Promise((resolve) => {
      closeModal();

      const el = document.createElement('div');
      el.className = 'modal';
      el.innerHTML = `
        <div class="modal-box">
          <h3>${esc(opts.title)}</h3>
          <p>${opts.message}</p>
          <div class="modal-actions">
            <button class="btn-cancel">${esc(opts.cancelLabel || 'Huỷ')}</button>
            <button class="btn-ok ${opts.danger ? 'danger' : ''}">${esc(opts.confirmLabel || 'Đồng ý')}</button>
          </div>
        </div>`;

      const done = (v) => { closeModal(); resolve(v); };
      el.querySelector('.btn-cancel').onclick = () => done(false);
      el.querySelector('.btn-ok').onclick = () => done(true);
      el.onclick = (e) => { if (e.target === el) done(false); };

      const onKey = (e) => {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); done(false); }
        if (e.key === 'Enter') { document.removeEventListener('keydown', onKey); done(true); }
      };
      document.addEventListener('keydown', onKey);

      document.body.appendChild(el);
      modalEl = el;
      el.querySelector('.btn-ok').focus();
    });
  }

  /* ------------------------------------------------ xem chi tiết ------ */

  const STAT_NAMES = {
    str: 'Sức Mạnh', int: 'Trí Tuệ', vit: 'Thể Chất',
    agi: 'Nhanh Nhẹn', wil: 'Ý Chí',
  };

  function itemDetail(item, color) {
    closeModal();

    const stats = Object.entries(item.stats || {})
      .map(([k, v]) => `<div class="detail-line"><span>${STAT_NAMES[k] || k}</span><span class="v">+${v}</span></div>`)
      .join('');

    const passives = (item.passives || [])
      .map((p) => `<div class="detail-passive">◆ <b>${esc(p.name)}</b> — ${esc(p.desc)}</div>`)
      .join('');

    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-box">
        <div class="detail-head">
          <div class="detail-icon" style="background:${color};border-color:${color}"></div>
          <div>
            <div class="detail-name" style="color:${color}">${esc(item.name)}</div>
            <div class="detail-sub">${esc(item.rarityName)} · Cấp ${item.level} · ${esc(slotName(item.slot))}</div>
          </div>
        </div>
        ${stats ? `<div class="detail-block"><h4>Chỉ số</h4>${stats}</div>` : ''}
        ${passives ? `<div class="detail-block"><h4>Bị động</h4>${passives}</div>` : ''}
        ${!passives ? '<div class="detail-block"><h4>Bị động</h4><p style="font-size:12px;color:#6b7791">Món này không có bị động. Từ hạng Hiếm trở lên mới có.</p></div>' : ''}
        <div class="modal-actions"><button class="btn-ok">Đóng</button></div>
      </div>`;

    el.querySelector('.btn-ok').onclick = closeModal;
    el.onclick = (e) => { if (e.target === el) closeModal(); };
    document.body.appendChild(el);
    modalEl = el;
  }

  function slotName(slot) {
    return {
      weapon: 'Vũ khí chính', offhand: 'Vũ khí phụ / Khiên', head: 'Mũ', chest: 'Giáp thân',
      hands: 'Găng tay', feet: 'Giày', cape: 'Áo choàng', amulet: 'Dây chuyền', ring: 'Nhẫn',
    }[slot] || slot;
  }

  function closeModal() {
    modalEl?.remove();
    modalEl = null;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, menu, closeMenu, confirm, itemDetail, closeModal, esc };
})();
