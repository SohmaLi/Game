'use strict';

/**
 * Bảng nhân vật: trang bị, chỉ số, túi đồ.
 *
 * Không giữ trạng thái riêng. Mọi thao tác gửi lên server, server trả về toàn
 * bộ bảng nhân vật rồi vẽ lại từ đầu. Chậm hơn việc tự sửa tại chỗ vài mili
 * giây, đổi lại không bao giờ có chuyện màn hình hiện một đằng còn server
 * lưu một nẻo — thứ tối kỵ khi đụng tới đồ đạc của người chơi.
 */

const Panel = (() => {
  const $ = (id) => document.getElementById(id);

  const STAT_NAMES = {
    str: 'Sức Mạnh', int: 'Trí Tuệ', vit: 'Thể Chất',
    agi: 'Nhanh Nhẹn', wil: 'Ý Chí',
  };

  const RARITY_COLOR = {
    common: '#9aa5ba', fine: '#e6e9ef', rare: '#5b9cff',
    epic: '#a97bff', legendary: '#ff9f43',
  };

  const RARITY_NAME = {
    common: 'Thường', fine: 'Tốt', rare: 'Hiếm',
    epic: 'Sử Thi', legendary: 'Truyền Thuyết',
  };

  /** Thứ tự từ rẻ tới quý — bộ lọc nhanh chỉ đề nghị xoá từ dưới lên. */
  const RARITY_ORDER = ['common', 'fine', 'rare', 'epic', 'legendary'];

  let socket = null;
  let data = null;

  /**
   * Chế độ chọn nhiều món để xoá.
   *
   * Tách riêng khỏi `data` vì `data` bị ghi đè mỗi lần server gửi lại bảng nhân
   * vật — mà server gửi lại sau MỌI thao tác. Nhét lựa chọn vào đó thì cứ nhặt
   * được một món rơi ra là mất sạch những ô vừa tick.
   */
  const pick = { on: false, uids: new Set() };

  /* ------------------------------------------------ khởi tạo ---------- */

  function init(sock) {
    socket = sock;

    socket.on('character', (c) => { update(c); Tree.update(c); });
    socket.on('reward', (r) => showRewards(r));

    $('openPanel').onclick = toggle;
    $('openTree').onclick = () => Tree.open();
    // Bấm thẳng vào thanh kinh nghiệm cũng mở bảng nhân vật — đó là thứ người
    // chơi nhìn nhiều nhất, nên nó cũng nên là chỗ bấm vào để xem chi tiết
    $('sbMain').onclick = toggle;
    $('panelClose').onclick = close;
    $('panel').addEventListener('click', (e) => { if (e.target.id === 'panel') close(); });

    $('pPickToggle').onclick = () => setPickMode(!pick.on);
    $('pPickClear').onclick = () => { pick.uids.clear(); renderBag(); };
    $('pPickDelete').onclick = discardPicked;
  }

  /* ------------------------------------------------ chọn để xoá ------- */

  function setPickMode(on) {
    pick.on = on;
    pick.uids.clear();
    $('pPickToggle').textContent = on ? 'Xong' : 'Chọn để xoá';
    $('pPickToggle').classList.toggle('on', on);
    $('pPickBar').classList.toggle('hidden', !on);
    hideTip();
    if (isOpen()) { renderBag(); setupDrag(); }
  }

  /**
   * Bộ lọc nhanh: bấm "Thường" là tick hết đồ hạng Thường trong túi.
   *
   * Chỉ dựng nút cho hạng thật sự đang có đồ — một hàng nút mà quá nửa bấm vào
   * không chọn được gì thì người chơi tưởng nút hỏng.
   */
  function renderPickFilters() {
    const box = $('pPickFilters');
    box.innerHTML = '';
    if (!data) return;

    const counts = new Map();
    for (const it of data.bag) counts.set(it.rarity, (counts.get(it.rarity) || 0) + 1);

    for (const r of RARITY_ORDER) {
      const n = counts.get(r) || 0;
      if (!n) continue;
      const b = document.createElement('button');
      b.className = 'p-pick-f';
      b.style.color = RARITY_COLOR[r];
      b.style.borderColor = RARITY_COLOR[r];
      b.textContent = `${RARITY_NAME[r]} (${n})`;
      b.onclick = () => {
        // Bấm lần nữa thì bỏ chọn cả hạng đó — nếu không, tick nhầm là phải
        // bấm "Bỏ chọn" rồi tick lại từ đầu
        const ids = data.bag.filter((i) => i.rarity === r).map((i) => i.uid);
        const allOn = ids.every((id) => pick.uids.has(id));
        for (const id of ids) allOn ? pick.uids.delete(id) : pick.uids.add(id);
        renderBag();
      };
      box.appendChild(b);
    }

    const all = document.createElement('button');
    all.className = 'p-pick-f all';
    all.textContent = `Cả túi (${data.bag.length})`;
    all.onclick = () => {
      const allOn = data.bag.length > 0 && data.bag.every((i) => pick.uids.has(i.uid));
      pick.uids.clear();
      if (!allOn) for (const i of data.bag) pick.uids.add(i.uid);
      renderBag();
    };
    box.appendChild(all);
  }

  /**
   * Xoá hàng loạt. Hỏi lại kèm THỐNG KÊ THEO HẠNG, không chỉ tổng số.
   *
   * "Xoá 23 món?" không nói lên điều gì. "23 món, trong đó 2 Truyền Thuyết" thì
   * người chơi dừng tay đúng lúc cần dừng.
   */
  async function discardPicked() {
    const chosen = data.bag.filter((i) => pick.uids.has(i.uid));
    if (!chosen.length) return;

    const byRarity = RARITY_ORDER
      .map((r) => [r, chosen.filter((i) => i.rarity === r).length])
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `<span style="color:${RARITY_COLOR[r]}">${n} ${RARITY_NAME[r]}</span>`)
      .join(' · ');

    const precious = chosen.filter((i) => ['rare', 'epic', 'legendary'].includes(i.rarity)).length;

    const ok = await UI.confirm({
      title: `Xoá ${chosen.length} món?`,
      message: `${byRarity}<br><br>${precious
        ? `<span class="warn">Trong đó có <b>${precious}</b> món hạng cao. Xoá rồi là mất vĩnh viễn, không lấy lại được.</span>`
        : 'Số đồ này sẽ biến mất vĩnh viễn.'}`,
      confirmLabel: `Xoá ${chosen.length} món`,
      danger: true,
    });
    if (!ok) return;

    socket.emit('inv:discardMany', { uids: [...pick.uids] }, (res) => {
      if (!res?.ok) return toast('warn', 'Không xoá được', res?.error || '');
      toast('warn', `Đã xoá ${res.removed.length} món`, 'Túi đồ đã gọn hơn');
      setPickMode(false);
    });
  }

  function isOpen() { return !$('panel').classList.contains('hidden'); }
  function open() { Tree.close(); $('panel').classList.remove('hidden'); render(); }
  // Đóng bảng là thoát luôn chế độ chọn: mở lại mà vẫn còn 20 ô đang tick từ
  // lúc nào không nhớ là công thức để bấm Xoá nhầm
  function close() {
    $('panel').classList.add('hidden');
    hideTip();
    if (pick.on) setPickMode(false);
  }
  function toggle() { isOpen() ? close() : open(); }

  function update(c) {
    data = c;
    renderStatusBar();
    // HUD góc trái chỉ nghe bảng nhân vật khi đang ngoài trận; trong trận thì
    // dữ liệu thật nằm ở combatant nên để màn chiến đấu tự nuôi nó
    if (!Battle.isOpen()) Hud.fromCharacter(c);
    if (isOpen()) render();
  }

  /* ------------------------------------------------ thanh dưới -------- */

  function renderStatusBar() {
    if (!data) return;
    $('statusBar').classList.remove('hidden');
    $('sbName').textContent = data.name;
    $('sbLevel').textContent = data.level;
    $('sbGold').textContent = data.gold;

    const pct = data.expNeeded && isFinite(data.expNeeded)
      ? (data.exp / data.expNeeded) * 100 : 100;
    $('sbExpFill').style.width = `${Math.min(100, pct)}%`;
    $('sbExpText').textContent = isFinite(data.expNeeded)
      ? `${data.exp} / ${data.expNeeded}` : 'Tối đa';

    // Hai chấm báo riêng: điểm chỉ số tiêu ở Balo, điểm kỹ năng tiêu ở cây
    const statPts = data.statPoints || 0;
    const skillPts = data.skillPoints || 0;
    $('sbStatPts').classList.toggle('hidden', !statPts);
    $('sbStatPts').textContent = statPts;
    $('sbSkillPts').classList.toggle('hidden', !skillPts);
    $('sbSkillPts').textContent = skillPts;
  }

  /* ------------------------------------------------ vẽ bảng ----------- */

  function render() {
    if (!data) return;
    clearTips();
    renderSlots();
    renderStats();
    renderPassives();
    renderBag();
    setupDrag();
  }

  /**
   * Bị động nằm rải trên 10 món trang bị. Không có chỗ liệt kê gộp thì người
   * chơi phải mở từng món ra mới biết mình đang thật sự được hưởng những gì.
   */
  function renderPassives() {
    const box = $('pPassives');
    const list = data.passives || [];

    if (!list.length) {
      box.innerHTML = `<p class="passive-empty">Chưa có bị động nào.<br>
        Trang bị từ hạng <b style="color:${RARITY_COLOR.rare}">Hiếm</b> trở lên mới mang bị động.</p>`;
      return;
    }

    box.innerHTML = list.map((p) => `
      <div class="passive-row" title="${esc(p.desc)}">
        <span>
          <span class="passive-name">${esc(p.name)}${p.stacks > 1 ? ` ×${p.stacks}` : ''}</span>
          <span class="passive-from">${esc(p.sources.join(', '))}</span>
        </span>
        <span class="passive-val">${esc(p.value)}</span>
      </div>`).join('');
  }

  function renderSlots() {
    const box = $('pSlots');
    box.innerHTML = '';

    for (const slot of data.slots) {
      const item = data.equipped[slot.id];
      const el = document.createElement('div');
      el.className = `slot ${item ? '' : 'empty'}`;
      // Ô nhẫn dùng chung một hình; màu icon chạy theo hạng đồ, ô trống thì xám
      const iconKey = `slot-${slot.id.startsWith('ring') ? 'ring' : slot.id}`;
      const iconColor = item ? RARITY_COLOR[item.rarity] : '#3d4658';

      el.innerHTML = `
        <div class="slot-drop" data-slot="${slot.id}">
          ${item
            ? `<div class="cell filled ico slot-icon" data-uid="${item.uid}"
                    style="color:${iconColor};border-color:${RARITY_COLOR[item.rarity]}">${Icons.svg(iconKey)}</div>`
            : `<div class="slot-icon slot-ghost" style="color:${iconColor}">${Icons.svg(iconKey)}</div>`}
        </div>
        <div class="slot-info">
          <div class="slot-label">${slot.name}</div>
          <div class="slot-item" style="color:${item ? RARITY_COLOR[item.rarity] : '#4a5568'}">
            ${item ? esc(item.name) : '— trống —'}
          </div>
        </div>`;

      if (item) {
        attachTip(el, item, 'Bấm để tháo ra · kéo ra túi · chuột phải để xem thêm');
        el.onclick = () => { hideTip(); unequip(slot.id); };
        el.oncontextmenu = (e) => {
          e.preventDefault();
          hideTip();
          UI.menu(e, {
            title: item.name,
            subtitle: `${item.rarityName} · Cấp ${item.level} · đang mặc`,
            color: RARITY_COLOR[item.rarity],
            items: [
              { icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => UI.itemDetail(item, RARITY_COLOR[item.rarity]) },
              { icon: '↩', label: 'Tháo ra', onClick: () => unequip(slot.id) },
              null,
              { icon: Icons.svg('ui-trash') || '🗑', label: 'Vứt bỏ', danger: true, onClick: () => discardEquipped(slot, item) },
            ],
          });
        };
      }
      box.appendChild(el);
    }
  }

  function renderStats() {
    const box = $('pStats');
    box.innerHTML = '';

    for (const [key, label] of Object.entries(STAT_NAMES)) {
      const bonus = data.equipBonus[key] || 0;
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <span class="stat-label">${label}</span>
        <span>
          <span class="stat-val">${data.stats[key]}</span>
          ${bonus ? `<span class="stat-bonus">+${bonus}</span>` : ''}
        </span>`;

      const btn = document.createElement('button');
      btn.className = 'stat-add';
      btn.textContent = '+';
      btn.disabled = !data.statPoints;
      btn.title = data.statPoints ? `Cộng 1 điểm vào ${label}` : 'Hết điểm';
      btn.onclick = () => socket.emit('stat:spend', { stat: key }, (res) => {
        if (!res?.ok) toast('warn', 'Không cộng được', res?.error || '');
      });
      row.lastElementChild.appendChild(btn);
      box.appendChild(row);
    }

    const c = data.combat;
    $('pCombat').innerHTML = [
      ['Máu tối đa', c.hpMax],
      ['Mana tối đa', c.manaMax],
      ['Sát thương vật lý', c.atkPhys],
      ['Sát thương phép', c.atkMagic],
      ['Giáp', c.armor],
      ['Kháng phép', c.resist],
      ['Tốc độ ra tay', c.speed],
      ['Chí mạng', `${c.crit}%`],
      ['Né tránh', `${c.dodge}%`],
    ].map(([k, v]) =>
      `<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-val">${v}</span></div>`
    ).join('');
  }

  function renderBag() {
    const box = $('pBag');
    box.innerHTML = '';
    $('pBagCount').textContent = `${data.bag.length}/${data.bagSize}`;

    // Món đã bị xoá hoặc đã mặc thì bỏ khỏi lựa chọn, nếu không con số "Đã chọn"
    // đếm cả những uid không còn tồn tại
    if (pick.on) {
      const inBag = new Set(data.bag.map((i) => i.uid));
      for (const uid of [...pick.uids]) if (!inBag.has(uid)) pick.uids.delete(uid);
      renderPickFilters();
      $('pPickCount').textContent = `Đã chọn ${pick.uids.size}`;
      $('pPickDelete').disabled = pick.uids.size === 0;
      $('pPickDelete').textContent = pick.uids.size ? `Xoá ${pick.uids.size} món` : 'Xoá';
    }

    for (const item of data.bag) {
      const cell = document.createElement('div');
      cell.className = 'cell filled';
      cell.dataset.uid = item.uid;
      cell.style.color = RARITY_COLOR[item.rarity];
      cell.style.borderColor = RARITY_COLOR[item.rarity];
      const ico = Icons.svg(`slot-${item.slot === 'ring' ? 'ring' : item.slot}`);
      // Không có icon thì để nguyên khối màu đặc cũ làm phương án dự phòng
      if (ico) { cell.classList.add('ico'); cell.innerHTML = ico; }
      if (pick.on) {
        const on = pick.uids.has(item.uid);
        cell.classList.add('pickable');
        cell.classList.toggle('picked', on);
        attachTip(cell, item, 'Bấm để chọn / bỏ chọn');
        cell.onclick = () => {
          on ? pick.uids.delete(item.uid) : pick.uids.add(item.uid);
          renderBag();
        };
        // Chuột phải vẫn xem được chi tiết — đang định xoá thì càng cần xem kỹ
        cell.oncontextmenu = (e) => {
          e.preventDefault();
          hideTip();
          UI.itemDetail(item, RARITY_COLOR[item.rarity]);
        };
        box.appendChild(cell);
        continue;
      }

      attachTip(cell, item, 'Bấm để mặc · kéo vào ô trang bị · chuột phải để xem thêm');
      cell.onclick = () => { hideTip(); equip(item); };
      cell.oncontextmenu = (e) => {
        e.preventDefault();
        hideTip();
        UI.menu(e, {
          title: item.name,
          subtitle: `${item.rarityName} · Cấp ${item.level}`,
          color: RARITY_COLOR[item.rarity],
          items: [
            { icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => UI.itemDetail(item, RARITY_COLOR[item.rarity]) },
            { icon: Icons.svg('ui-equip') || '⬆', label: 'Mặc vào', onClick: () => equip(item) },
            null,
            { icon: Icons.svg('ui-trash') || '🗑', label: 'Vứt bỏ', danger: true, onClick: () => discard(item) },
          ],
        });
      };
      box.appendChild(cell);
    }

    // Ô trống cho đủ lưới, nhìn ra ngay còn bao nhiêu chỗ
    for (let i = data.bag.length; i < Math.min(data.bagSize, data.bag.length + 12); i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      box.appendChild(cell);
    }
  }

  /* ------------------------------------------------ hành động --------- */

  function equip(item) {
    socket.emit('inv:equip', { uid: item.uid }, (res) => {
      if (!res?.ok) toast('warn', 'Không mặc được', res?.error || '');
    });
  }

  function unequip(slotId) {
    socket.emit('inv:unequip', { slot: slotId }, (res) => {
      if (!res?.ok) toast('warn', 'Không tháo được', res?.error || '');
    });
  }

  /**
   * Vứt đồ là hành động không hoàn tác được, nên luôn hỏi lại. Đồ hạng cao thì
   * cảnh báo mạnh hơn — mất một món Truyền Thuyết vì lỡ tay là chuyện người
   * chơi sẽ nhớ rất lâu.
   */
  async function discard(item) {
    const precious = ['rare', 'epic', 'legendary'].includes(item.rarity);
    const ok = await UI.confirm({
      title: 'Vứt bỏ món này?',
      message: `<b style="color:${RARITY_COLOR[item.rarity]}">${UI.esc(item.name)}</b>
        <span style="color:#6b7791">(${UI.esc(item.rarityName)} · Cấp ${item.level})</span>
        <br><br>${precious
          ? '<span class="warn">Đây là đồ hạng cao. Vứt rồi là mất vĩnh viễn, không lấy lại được.</span>'
          : 'Món đồ sẽ biến mất vĩnh viễn.'}`,
      confirmLabel: 'Vứt bỏ',
      danger: true,
    });
    if (!ok) return;

    socket.emit('inv:discard', { uid: item.uid }, (res) => {
      if (res?.ok) toast('warn', 'Đã vứt', item.name);
      else toast('warn', 'Không vứt được', res?.error || '');
    });
  }

  /** Đồ đang mặc phải tháo ra trước rồi mới vứt được. */
  async function discardEquipped(slot, item) {
    const ok = await UI.confirm({
      title: 'Tháo ra rồi vứt bỏ?',
      message: `<b style="color:${RARITY_COLOR[item.rarity]}">${UI.esc(item.name)}</b> đang được mặc ở ô
        <b>${UI.esc(slot.name)}</b>.<br><br>Món này sẽ được tháo ra và vứt bỏ vĩnh viễn.`,
      confirmLabel: 'Tháo và vứt',
      danger: true,
    });
    if (!ok) return;

    socket.emit('inv:unequip', { slot: slot.id }, (res) => {
      if (!res?.ok) return toast('warn', 'Không tháo được', res?.error || '');
      socket.emit('inv:discard', { uid: item.uid }, (r2) => {
        if (r2?.ok) toast('warn', 'Đã vứt', item.name);
      });
    });
  }

  /* ------------------------------------------------ tooltip ----------- */

  /**
   * Tooltip do Tippy.js lo phần đặt chỗ.
   *
   * Trước đây tự tính: bám theo con trỏ rồi kẹp lại ở mép màn hình. Nó hỏng ở
   * đúng chỗ khó nhất — ô ở hàng cuối, cột ngoài cùng, nơi tooltip cần LẬT sang
   * phía khác chứ không phải bị đẩy dúm vào. Tippy lật và trượt sẵn.
   */
  let tips = [];

  function tipHtml(item, hint) {
    const stats = Object.entries(item.stats || {})
      .map(([k, v]) => `<div class="tip-stat">+${v} ${STAT_NAMES[k] || k}</div>`).join('');
    const passives = (item.passives || [])
      .map((p) => `<div class="tip-passive">◆ ${esc(p.name)} — ${esc(p.desc)}</div>`).join('');

    return `
      <h4 style="color:${RARITY_COLOR[item.rarity]}">${esc(item.name)}</h4>
      <div class="tip-sub">${esc(item.rarityName)} · Cấp ${item.level}</div>
      ${stats}${passives}
      <div class="tip-hint">${hint}</div>`;
  }

  function attachTip(el, item, hint) {
    if (typeof tippy !== 'function') return;   // thư viện không nạp được thì thôi
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

  /** Vẽ lại bảng là thay sạch DOM — không dọn thì mỗi lần mở lại rò thêm một lứa. */
  function clearTips() {
    for (const t of tips) t.destroy();
    tips = [];
  }

  function hideTip() { for (const t of tips) t.hide(); }

  /* ------------------------------------------------ kéo thả ----------- */

  /**
   * Kéo đồ giữa túi và ô trang bị (SortableJS).
   *
   * Chuột trái bấm để mặc/tháo vẫn giữ nguyên — kéo thả là đường thứ hai, không
   * phải đường duy nhất. Chạm màn hình và bàn phím vẫn phải dùng được.
   *
   * Server mới là nơi quyết định: thả xong chỉ gửi lệnh lên, rồi server trả về
   * cả bảng nhân vật và cả bảng được vẽ lại. Cái ô mà Sortable vừa nhích sang
   * chỗ mới bị ghi đè ngay — cố tình để vậy, vì nếu tin vào chỗ Sortable đặt nó
   * thì màn hình và server lệch nhau ngay lần đầu server từ chối.
   */
  let sortables = [];

  function clearSortables() {
    for (const s of sortables) { try { s.destroy(); } catch { /* DOM đã thay */ } }
    sortables = [];
  }

  const fitsSlot = (item, slotId) => (item.slot === 'ring'
    ? slotId === 'ring1' || slotId === 'ring2'
    : item.slot === slotId);

  function setupDrag() {
    if (typeof Sortable !== 'function') return;   // thư viện không nạp được thì thôi
    clearSortables();
    if (pick.on) return;                          // đang tick chọn thì đừng cho kéo

    const bag = $('pBag');
    sortables.push(Sortable.create(bag, {
      group: { name: 'items', pull: true, put: true },
      sort: false,                 // server không lưu thứ tự túi, sắp xếp là vô nghĩa
      draggable: '.cell.filled',
      animation: 130,
      // Kéo bằng chuột thay cho HTML5 drag-and-drop: trang này có canvas game
      // phủ toàn màn, native DnD trên đó mỗi trình duyệt một kiểu. Kèm theo,
      // chế độ này chạy được cả trên màn cảm ứng.
      forceFallback: true,
      fallbackTolerance: 4,
      ghostClass: 'p-drop-ghost',
      chosenClass: 'p-drag-chosen',
      dragClass: 'p-drag-move',
      onStart: hideTip,
      // Kéo từ ô trang bị về túi = tháo ra
      onAdd: (e) => {
        const slotId = e.from.dataset.slot;
        if (slotId) unequip(slotId);
      },
    }));

    for (const drop of document.querySelectorAll('#pSlots .slot-drop')) {
      const slotId = drop.dataset.slot;
      sortables.push(Sortable.create(drop, {
        group: {
          name: 'items',
          pull: true,
          // Chặn ngay lúc kéo qua: không cho thả cái mũ vào ô giày
          put: (to, from, dragEl) => {
            const item = itemByUid(dragEl?.dataset?.uid);
            return !!item && fitsSlot(item, slotId);
          },
        },
        sort: false,
        draggable: '.cell.filled',
        animation: 130,
        forceFallback: true,
        fallbackTolerance: 4,
        ghostClass: 'p-drop-ghost',
        chosenClass: 'p-drag-chosen',
        dragClass: 'p-drag-move',
        onStart: hideTip,
        onAdd: (e) => {
          const uid = e.item.dataset.uid;
          if (uid) socket.emit('inv:equip', { uid, slot: slotId }, (res) => {
            if (!res?.ok) toast('warn', 'Không mặc được', res?.error || '');
          });
        },
      }));
    }
  }

  function itemByUid(uid) {
    if (!uid || !data) return null;
    return data.bag.find((i) => i.uid === uid)
      || Object.values(data.equipped).find((i) => i && i.uid === uid)
      || null;
  }

  /* ------------------------------------------------ thông báo --------- */

  function showRewards(r) {
    if (r.levelUp) {
      toast('levelup', `Lên cấp ${r.levelUp.level}!`,
        `+${r.levelUp.pointsGained} điểm chỉ số để phân bổ`);
    }
    for (const item of r.items || []) {
      toast('item', `Nhận: ${item.name}`,
        `${item.rarityName} · Cấp ${item.level}`, RARITY_COLOR[item.rarity]);
    }
    if (r.booksFound) toast('item', `Rơi ${r.booksFound} Sách Dị Điển`, 'Xem trong túi đồ');
    if (r.lostToFullBag) {
      toast('warn', `Mất ${r.lostToFullBag} món`, 'Túi đã đầy — dọn bớt đi');
    }
  }

  function toast(kind, title, sub, color) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    if (color) el.style.borderLeftColor = color;
    el.innerHTML = `<div class="t-title">${esc(title)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}`;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, update, toggle, close, isOpen, toast };
})();
