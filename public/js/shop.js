'use strict';

/**
 * Cửa hàng của thương nhân — ba tab: Mua · Bán đồ · Bán sách.
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

  /**
   * Sách đang tick để bán — bộ RIÊNG với đồ.
   *
   * Dùng chung một `Set` thì tick vài món ở tab Bán đồ, chuyển sang tab Bán
   * sách bấm "Bán" là bán luôn cả đống đồ vừa tick mà bảng xác nhận không hề
   * nhắc tới. Hai danh sách, hai nút, không dính vào nhau.
   */
  const pickedBooks = new Set();

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
    $('shBookClear').onclick = () => { pickedBooks.clear(); render(); };
    $('shBookBtn').onclick = sellPickedBooks;
  }

  /* ------------------------------------------------ mở / đóng --------- */

  const isOpen = () => !$('shop').classList.contains('hidden');

  function open(theNpc) {
    npc = theNpc;
    picked.clear();
    pickedBooks.clear();
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
    pickedBooks.clear();
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
    renderBooks();
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

  /* ------------------------------------------------ bán sách --------- */

  /** Màu theo hạng con quái đã rơi ra cuốn sách — cùng bảng với quầng quái trên bản đồ. */
  const BOOK_TIER = {
    common: { name: 'Quái thường', color: '#9aa5ba' },
    elite: { name: 'Tinh Anh', color: '#c48bff' },
    boss: { name: 'Thủ Lĩnh', color: '#ffd166' },
  };
  const BOOK_TIER_ORDER = ['common', 'elite', 'boss'];
  const tierOf = (b) => BOOK_TIER[b.tier] || BOOK_TIER.common;

  /**
   * Sách Dị Điển chất đống nhanh hơn số ô để gắn — mười ô, mà sách rơi mãi.
   * Đây là đường ra duy nhất cho những cuốn trùng một kỹ năng chưa gắn ô nào:
   * gắn thì phí ô, tiêu nâng bậc thì không được, và trước đây vứt cũng không xong.
   */
  function renderBooks() {
    const box = $('shBookGrid');
    box.innerHTML = '';

    const books = data.books || [];
    const have = new Set(books.map((b) => b.uid));
    for (const uid of [...pickedBooks]) if (!have.has(uid)) pickedBooks.delete(uid);

    renderBookFilters(books);

    const total = books.filter((b) => pickedBooks.has(b.uid)).reduce((s, b) => s + b.price, 0);
    $('shBookCount').textContent = pickedBooks.size
      ? `Đã chọn ${pickedBooks.size} cuốn · +${total.toLocaleString('vi-VN')} vàng`
      : 'Chưa chọn cuốn nào';
    $('shBookBtn').disabled = pickedBooks.size === 0;
    $('shBookBtn').textContent = pickedBooks.size ? `Bán ${pickedBooks.size} cuốn` : 'Bán';

    if (!books.length) {
      box.innerHTML = `<p class="sh-empty">Không có cuốn nào chưa gắn.<br>
        Sách đang nằm trong ô Dị Điển là kỹ năng đang dùng — muốn bán thì gỡ khỏi ô trước.</p>`;
      return;
    }

    for (const b of books) {
      const on = pickedBooks.has(b.uid);
      const t = tierOf(b);
      const row = document.createElement('button');
      row.className = `sh-row${on ? ' picked' : ''}`;
      row.style.borderColor = t.color;
      row.innerHTML = `
        <span class="sh-ico" style="color:#d3b8f0">${Icons.svg('ui-book') || '✦'}</span>
        <span class="sh-info">
          <span class="sh-name" style="color:#d3b8f0">${esc(b.name || 'Dị Điển')}</span>
          <span class="sh-sub" style="color:${t.color}">${esc(t.name)} · từ ${esc(b.from || '?')}</span>
        </span>
        <span class="sh-price">+${b.price.toLocaleString('vi-VN')} <i class="sh-gold" data-icon="ui-gold">◆</i></span>`;

      Icons.paint(row);
      row.title = b.desc || '';
      row.onclick = () => {
        on ? pickedBooks.delete(b.uid) : pickedBooks.add(b.uid);
        render();
      };
      box.appendChild(row);
    }
  }

  function renderBookFilters(books) {
    const box = $('shBookFilters');
    box.innerHTML = '';
    if (!books.length) return;

    const counts = new Map();
    for (const b of books) counts.set(b.tier || 'common', (counts.get(b.tier || 'common') || 0) + 1);

    for (const t of BOOK_TIER_ORDER) {
      const n = counts.get(t) || 0;
      if (!n) continue;
      const btn = document.createElement('button');
      btn.className = 'sh-filter';
      btn.style.color = BOOK_TIER[t].color;
      btn.style.borderColor = BOOK_TIER[t].color;
      btn.textContent = `${BOOK_TIER[t].name} (${n})`;
      btn.onclick = () => {
        const ids = books.filter((b) => (b.tier || 'common') === t).map((b) => b.uid);
        const allOn = ids.every((id) => pickedBooks.has(id));
        for (const id of ids) allOn ? pickedBooks.delete(id) : pickedBooks.add(id);
        render();
      };
      box.appendChild(btn);
    }

    const all = document.createElement('button');
    all.className = 'sh-filter all';
    all.textContent = `Cả kho (${books.length})`;
    all.onclick = () => {
      const allOn = books.every((b) => pickedBooks.has(b.uid));
      pickedBooks.clear();
      if (!allOn) for (const b of books) pickedBooks.add(b.uid);
      render();
    };
    box.appendChild(all);
  }

  /**
   * Bán sách không lấy lại được, và sách Thủ Lĩnh rơi với tỉ lệ 40% từ một con
   * năm phút mới có một lần — nói thẳng con số đó ra trong bảng xác nhận, đừng
   * để người chơi phát hiện sau khi đã bấm.
   */
  async function sellPickedBooks() {
    const chosen = (data.books || []).filter((b) => pickedBooks.has(b.uid));
    if (!chosen.length) return;

    const gold = chosen.reduce((s, b) => s + b.price, 0);
    const byTier = BOOK_TIER_ORDER
      .map((t) => [t, chosen.filter((b) => (b.tier || 'common') === t).length])
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `<span style="color:${BOOK_TIER[t].color}">${n} ${BOOK_TIER[t].name}</span>`)
      .join(' · ');

    const precious = chosen.filter((b) => b.tier === 'boss' || b.tier === 'elite').length;

    const ok = await UI.confirm({
      title: `Bán ${chosen.length} cuốn Dị Điển?`,
      message: `${byTier}<br><br>Nhận về <b style="color:#ffd166">${gold.toLocaleString('vi-VN')} vàng</b>.${precious
        ? `<br><br><span class="warn">Trong đó <b>${precious}</b> cuốn rơi từ Tinh Anh hoặc Thủ Lĩnh — loại hiếm nhất, và quầy hàng không bán lại sách.</span>`
        : ''}`,
      confirmLabel: `Bán lấy ${gold.toLocaleString('vi-VN')} vàng`,
    });
    if (!ok) return;

    socket.emit('shop:sellBooks', { npcId: npc?.id, uids: [...pickedBooks] }, (res) => {
      if (!res?.ok) return Panel.toast?.('warn', 'Không bán được', res?.error || '');
      pickedBooks.clear();
      apply(res.state);
      Panel.toast?.('levelup', `Đã bán ${res.sold.length} cuốn`,
        `+${res.gold.toLocaleString('vi-VN')} vàng`);
    });
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
