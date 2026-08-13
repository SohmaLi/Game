'use strict';

/**
 * Cửa hàng của thương nhân — hai tab Mua và Bán.
 *
 * Cùng nguyên tắc với bảng nhân vật: KHÔNG giữ trạng thái riêng. Mỗi thao tác
 * gửi lên server, server trả về nguyên cả quầy hàng và cả túi đồ kèm giá, rồi
 * vẽ lại từ đầu. Giá bán phụ thuộc phí giao dịch của quốc gia, nên tự tính lại
 * ở client là dựng bản sao thứ hai của một công thức — kiểu lệch nhau âm thầm
 * mà chỉ người chơi Duskmoor mới phát hiện ra.
 */

const Shop = (() => {
  const $ = (id) => document.getElementById(id);

  const RARITY_COLOR = {
    common: '#9aa5ba', fine: '#e6e9ef', rare: '#5b9cff',
    epic: '#a97bff', legendary: '#ff9f43',
  };
  const RARITY_NAME = {
    common: 'Thường', fine: 'Tinh Xảo', rare: 'Hiếm',
    epic: 'Sử Thi', legendary: 'Truyền Thuyết',
  };
  const RARITY_ORDER = ['common', 'fine', 'rare', 'epic', 'legendary'];

  const STAT_NAMES = {
    str: 'Sức Mạnh', int: 'Trí Tuệ', vit: 'Thể Chất',
    agi: 'Nhanh Nhẹn', wil: 'Ý Chí',
  };

  let socket = null;
  let npc = null;
  let data = null;
  let tab = 'buy';

  /**
   * Những món đang tick để bán.
   *
   * Tách khỏi `data` vì `data` bị thay mới sau mỗi lần server trả lời — nhét
   * lựa chọn vào đó thì bán xong món đầu là mất sạch những ô vừa tick.
   */
  const picked = new Set();

  let ticker = null;   // đồng hồ đếm ngược tới lượt đổi hàng
  let tips = [];

  /* ------------------------------------------------ khởi tạo ---------- */

  function init(sock) {
    socket = sock;

    $('shopClose').onclick = close;
    $('shop').addEventListener('click', (e) => { if (e.target.id === 'shop') close(); });

    for (const btn of document.querySelectorAll('.sh-tab')) {
      btn.onclick = () => setTab(btn.dataset.tab);
    }

    $('shSellClear').onclick = () => { picked.clear(); render(); };
    $('shSellBtn').onclick = sellPicked;
  }

  /* ------------------------------------------------ mở / đóng --------- */

  const isOpen = () => !$('shop').classList.contains('hidden');

  function open(theNpc) {
    npc = theNpc;
    picked.clear();
    tab = 'buy';
    Panel.close();
    Tree.close();
    $('shop').classList.remove('hidden');
    $('shopTitle').textContent = theNpc.name;
    $('shopRole').textContent = theNpc.role;
    refresh();
  }

  function close() {
    if (!isOpen()) return;
    $('shop').classList.add('hidden');
    clearTips();
    clearInterval(ticker);
    ticker = null;
    picked.clear();
    data = null;
    npc = null;
  }

  /** Hỏi lại server toàn bộ quầy hàng. */
  function refresh() {
    socket.emit('shop:state', { npcId: npc?.id }, (res) => {
      if (!res?.ok) {
        Panel.toast?.('warn', 'Không mở được cửa hàng', res?.error || '');
        return close();
      }
      apply(res.state);
    });
  }

  function apply(state) {
    data = state;
    render();

    // Đồng hồ đổi hàng chạy ở client cho mượt; con số thật đến từ server sau
    // mỗi thao tác, nên trôi vài giây cũng tự về đúng
    clearInterval(ticker);
    ticker = setInterval(() => {
      if (!data) return;
      data.restockIn = Math.max(0, data.restockIn - 1);
      renderRestock();
      // Hết giờ thì hàng đã đổi ở server — lấy về, đừng bắt người chơi đoán
      if (data.restockIn === 0) refresh();
    }, 1000);
  }

  function setTab(name) {
    tab = name;
    for (const btn of document.querySelectorAll('.sh-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === name);
    }
    for (const pane of document.querySelectorAll('.sh-pane')) {
      pane.classList.toggle('active', pane.dataset.pane === name);
    }
    render();
  }

  /* ------------------------------------------------ vẽ ---------------- */

  function render() {
    if (!data) return;
    clearTips();

    $('shopGold').textContent = data.gold.toLocaleString('vi-VN');
    $('shopGreet').textContent = data.npc.greet;
    renderFee();
    renderRestock();
    renderBuy();
    renderSell();
  }

  /**
   * Phí giao dịch nói rõ ra thành con số.
   *
   * Đặc quyền của Duskmoor là "phí giao dịch giảm 50%" — một dòng chữ trên màn
   * tạo nhân vật mà trước đây không có chỗ nào trong game thể hiện. Người chơi
   * nước khác cũng cần biết mình đang trả bao nhiêu, nếu không con số cuối cùng
   * hiện ra trông như tuỳ tiện.
   */
  function renderFee() {
    const el = $('shopFee');
    const cut = data.fee < data.baseFee;
    el.innerHTML = cut
      ? `Phí giao dịch <b>${data.fee}%</b> <span class="sh-perk">Mối Lợi −50%</span>`
      : `Phí giao dịch <b>${data.fee}%</b>`;
    el.classList.toggle('perked', cut);
  }

  function renderRestock() {
    const s = data.restockIn;
    $('shopRestock').textContent = `Đổi hàng sau ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderBuy() {
    const box = $('shBuyGrid');
    box.innerHTML = '';

    if (!data.stock.length) {
      box.innerHTML = '<p class="sh-empty">Quầy đã hết hàng. Chờ lượt đổi hàng kế tiếp.</p>';
      return;
    }

    for (const item of data.stock) {
      const afford = data.gold >= item.price;
      const row = document.createElement('button');
      row.className = `sh-row${afford ? '' : ' poor'}`;
      row.style.borderColor = RARITY_COLOR[item.rarity];
      row.innerHTML = `
        <span class="sh-ico" style="color:${RARITY_COLOR[item.rarity]}">${Icons.svg(`slot-${item.slot === 'ring' ? 'ring' : item.slot}`) || '◆'}</span>
        <span class="sh-info">
          <span class="sh-name" style="color:${RARITY_COLOR[item.rarity]}">${esc(item.name)}</span>
          <span class="sh-sub">${esc(RARITY_NAME[item.rarity])} · Cấp ${item.level}</span>
        </span>
        <span class="sh-price">${item.price.toLocaleString('vi-VN')} <i class="sh-gold" data-icon="ui-gold">◆</i></span>`;

      Icons.paint(row);
      attachTip(row, item, afford ? 'Bấm để mua' : 'Không đủ vàng');
      row.onclick = () => buy(item);
      row.oncontextmenu = (e) => {
        e.preventDefault();
        hideTips();
        UI.itemDetail(item, RARITY_COLOR[item.rarity]);
      };
      box.appendChild(row);
    }
  }

  function renderSell() {
    const box = $('shSellGrid');
    box.innerHTML = '';

    // Món đã bán rồi thì bỏ khỏi lựa chọn, nếu không con số "Đã chọn" đếm cả
    // những uid không còn tồn tại
    const inBag = new Set(data.bag.map((i) => i.uid));
    for (const uid of [...picked]) if (!inBag.has(uid)) picked.delete(uid);

    renderSellFilters();

    const total = data.bag.filter((i) => picked.has(i.uid))
      .reduce((s, i) => s + i.price, 0);
    $('shSellCount').textContent = picked.size
      ? `Đã chọn ${picked.size} món · +${total.toLocaleString('vi-VN')} vàng`
      : 'Chưa chọn món nào';
    $('shSellBtn').disabled = picked.size === 0;
    $('shSellBtn').textContent = picked.size ? `Bán ${picked.size} món` : 'Bán';

    if (!data.bag.length) {
      box.innerHTML = '<p class="sh-empty">Túi trống. Đi đánh vài trận rồi quay lại.</p>';
      return;
    }

    for (const item of data.bag) {
      const on = picked.has(item.uid);
      const row = document.createElement('button');
      row.className = `sh-row${on ? ' picked' : ''}`;
      row.style.borderColor = RARITY_COLOR[item.rarity];
      row.innerHTML = `
        <span class="sh-ico" style="color:${RARITY_COLOR[item.rarity]}">${Icons.svg(`slot-${item.slot === 'ring' ? 'ring' : item.slot}`) || '◆'}</span>
        <span class="sh-info">
          <span class="sh-name" style="color:${RARITY_COLOR[item.rarity]}">${esc(item.name)}</span>
          <span class="sh-sub">${esc(RARITY_NAME[item.rarity])} · Cấp ${item.level}</span>
        </span>
        <span class="sh-price">+${item.price.toLocaleString('vi-VN')} <i class="sh-gold" data-icon="ui-gold">◆</i></span>`;

      Icons.paint(row);
      attachTip(row, item, 'Bấm để chọn / bỏ chọn · chuột phải để xem thêm');
      row.onclick = () => {
        on ? picked.delete(item.uid) : picked.add(item.uid);
        render();
      };
      row.oncontextmenu = (e) => {
        e.preventDefault();
        hideTips();
        UI.itemDetail(item, RARITY_COLOR[item.rarity]);
      };
      box.appendChild(row);
    }
  }

  /**
   * Bộ lọc nhanh theo hạng, giống hệt bên xoá hàng loạt — dọn túi sau một buổi
   * đi săn là chọn "cả đống hàng Thường", không phải bấm từng ô.
   */
  function renderSellFilters() {
    const box = $('shSellFilters');
    box.innerHTML = '';

    const counts = new Map();
    for (const it of data.bag) counts.set(it.rarity, (counts.get(it.rarity) || 0) + 1);

    for (const r of RARITY_ORDER) {
      const n = counts.get(r) || 0;
      if (!n) continue;
      const b = document.createElement('button');
      b.className = 'sh-filter';
      b.style.color = RARITY_COLOR[r];
      b.style.borderColor = RARITY_COLOR[r];
      b.textContent = `${RARITY_NAME[r]} (${n})`;
      b.onclick = () => {
        const ids = data.bag.filter((i) => i.rarity === r).map((i) => i.uid);
        const allOn = ids.every((id) => picked.has(id));
        for (const id of ids) allOn ? picked.delete(id) : picked.add(id);
        render();
      };
      box.appendChild(b);
    }

    if (!data.bag.length) return;
    const all = document.createElement('button');
    all.className = 'sh-filter all';
    all.textContent = `Cả túi (${data.bag.length})`;
    all.onclick = () => {
      const allOn = data.bag.every((i) => picked.has(i.uid));
      picked.clear();
      if (!allOn) for (const i of data.bag) picked.add(i.uid);
      render();
    };
    box.appendChild(all);
  }

  /* ------------------------------------------------ thao tác ---------- */

  function buy(item) {
    hideTips();
    socket.emit('shop:buy', { npcId: npc?.id, uid: item.uid }, (res) => {
      if (!res?.ok) return Panel.toast?.('warn', 'Không mua được', res?.error || '');
      apply(res.state);
      Panel.toast?.('item', `Đã mua: ${res.bought.name}`,
        `−${res.bought.price.toLocaleString('vi-VN')} vàng`, RARITY_COLOR[res.bought.rarity]);
    });
  }

  /**
   * Bán là hành động KHÔNG hoàn tác được — món đồ đi luôn, mua lại thì đắt gấp
   * mấy lần. Hỏi lại kèm thống kê theo hạng chứ không chỉ tổng số: "bán 23 món"
   * không nói lên điều gì, "trong đó 2 món Hiếm" thì người chơi dừng đúng lúc.
   */
  async function sellPicked() {
    const chosen = data.bag.filter((i) => picked.has(i.uid));
    if (!chosen.length) return;

    const gold = chosen.reduce((s, i) => s + i.price, 0);
    const byRarity = RARITY_ORDER
      .map((r) => [r, chosen.filter((i) => i.rarity === r).length])
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `<span style="color:${RARITY_COLOR[r]}">${n} ${RARITY_NAME[r]}</span>`)
      .join(' · ');

    const precious = chosen.filter((i) => ['rare', 'epic', 'legendary'].includes(i.rarity)).length;

    const ok = await UI.confirm({
      title: `Bán ${chosen.length} món?`,
      message: `${byRarity}<br><br>Nhận về <b style="color:#ffd166">${gold.toLocaleString('vi-VN')} vàng</b>.${precious
        ? `<br><br><span class="warn">Trong đó có <b>${precious}</b> món hạng cao. Quầy hàng không bán lại đồ đã bán, và mua đồ cùng hạng thì đắt gấp mấy lần.</span>`
        : ''}`,
      confirmLabel: `Bán lấy ${gold.toLocaleString('vi-VN')} vàng`,
    });
    if (!ok) return;

    socket.emit('shop:sell', { npcId: npc?.id, uids: [...picked] }, (res) => {
      if (!res?.ok) return Panel.toast?.('warn', 'Không bán được', res?.error || '');
      picked.clear();
      apply(res.state);
      Panel.toast?.('levelup', `Đã bán ${res.sold.length} món`,
        `+${res.gold.toLocaleString('vi-VN')} vàng`);
    });
  }

  /* ------------------------------------------------ tooltip ----------- */

  function tipHtml(item, hint) {
    const stats = Object.entries(item.stats || {})
      .map(([k, v]) => `<div class="tip-stat">+${v} ${STAT_NAMES[k] || k}</div>`).join('');
    const passives = (item.passives || [])
      .map((p) => `<div class="tip-passive">◆ ${esc(p.name)} — ${esc(p.desc)}</div>`).join('');

    return `
      <h4 style="color:${RARITY_COLOR[item.rarity]}">${esc(item.name)}</h4>
      <div class="tip-sub">${esc(RARITY_NAME[item.rarity])} · Cấp ${item.level}</div>
      ${stats}${passives}
      <div class="tip-hint">${esc(hint)}</div>`;
  }

  function attachTip(el, item, hint) {
    if (typeof tippy !== 'function') return;
    tips.push(tippy(el, {
      content: tipHtml(item, hint),
      allowHTML: true,
      theme: 'frozen',
      placement: 'right',
      offset: [0, 12],
      delay: [90, 0],
      duration: [90, 60],
      maxWidth: 290,
      appendTo: () => document.body,
    }));
  }

  /** Vẽ lại là thay sạch DOM — không dọn thì mỗi lần mở lại rò thêm một lứa. */
  function clearTips() {
    for (const t of tips) t.destroy();
    tips = [];
  }
  function hideTips() { for (const t of tips) t.hide(); }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, open, close, isOpen };
})();
