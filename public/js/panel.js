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

  let socket = null;
  let data = null;

  /* ------------------------------------------------ khởi tạo ---------- */

  function init(sock) {
    socket = sock;

    socket.on('character', (c) => update(c));
    socket.on('reward', (r) => showRewards(r));

    $('openPanel').onclick = toggle;
    $('panelClose').onclick = close;
    $('panel').addEventListener('click', (e) => { if (e.target.id === 'panel') close(); });
  }

  function isOpen() { return !$('panel').classList.contains('hidden'); }
  function open() { $('panel').classList.remove('hidden'); render(); }
  function close() { $('panel').classList.add('hidden'); hideTip(); }
  function toggle() { isOpen() ? close() : open(); }

  function update(c) {
    data = c;
    renderStatusBar();
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

    $('sbPoints').classList.toggle('hidden', !data.statPoints);
    $('sbPointsN').textContent = data.statPoints;
  }

  /* ------------------------------------------------ vẽ bảng ----------- */

  function render() {
    if (!data) return;
    renderSlots();
    renderStats();
    renderBag();
  }

  function renderSlots() {
    const box = $('pSlots');
    box.innerHTML = '';

    for (const slot of data.slots) {
      const item = data.equipped[slot.id];
      const el = document.createElement('div');
      el.className = `slot ${item ? '' : 'empty'}`;
      el.innerHTML = `
        <div class="slot-icon" style="${item ? `background:${RARITY_COLOR[item.rarity]};border-color:${RARITY_COLOR[item.rarity]}` : ''}"></div>
        <div class="slot-info">
          <div class="slot-label">${slot.name}</div>
          <div class="slot-item" style="color:${item ? RARITY_COLOR[item.rarity] : '#4a5568'}">
            ${item ? esc(item.name) : '— trống —'}
          </div>
        </div>`;

      if (item) {
        el.onmouseenter = (e) => showTip(e, item, 'Bấm để tháo ra');
        el.onmousemove = moveTip;
        el.onmouseleave = hideTip;
        el.onclick = () => {
          hideTip();
          socket.emit('inv:unequip', { slot: slot.id }, (res) => {
            if (!res?.ok) toast('warn', 'Không tháo được', res?.error || '');
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

    for (const item of data.bag) {
      const cell = document.createElement('div');
      cell.className = 'cell filled';
      cell.style.color = RARITY_COLOR[item.rarity];
      cell.style.borderColor = RARITY_COLOR[item.rarity];
      cell.onmouseenter = (e) => showTip(e, item, 'Bấm để mặc · Shift+bấm để vứt');
      cell.onmousemove = moveTip;
      cell.onmouseleave = hideTip;
      cell.onclick = (e) => {
        hideTip();
        if (e.shiftKey) {
          socket.emit('inv:discard', { uid: item.uid });
        } else {
          socket.emit('inv:equip', { uid: item.uid }, (res) => {
            if (!res?.ok) toast('warn', 'Không mặc được', res?.error || '');
          });
        }
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

  /* ------------------------------------------------ tooltip ----------- */

  function showTip(e, item, hint) {
    const tip = $('tooltip');
    const stats = Object.entries(item.stats || {})
      .map(([k, v]) => `<div class="tip-stat">+${v} ${STAT_NAMES[k] || k}</div>`).join('');
    const passives = (item.passives || [])
      .map((p) => `<div class="tip-passive">◆ ${esc(p.name)} — ${esc(p.desc)}</div>`).join('');

    tip.innerHTML = `
      <h4 style="color:${RARITY_COLOR[item.rarity]}">${esc(item.name)}</h4>
      <div class="tip-sub">${esc(item.rarityName)} · Cấp ${item.level}</div>
      ${stats}${passives}
      <div class="tip-hint">${hint}</div>`;
    tip.classList.remove('hidden');
    moveTip(e);
  }

  function moveTip(e) {
    const tip = $('tooltip');
    // Lật sang trái / lên trên khi sát mép, để tooltip không bị cắt
    const x = e.clientX + 16;
    const y = e.clientY + 16;
    tip.style.left = `${Math.min(x, window.innerWidth - tip.offsetWidth - 10)}px`;
    tip.style.top = `${Math.min(y, window.innerHeight - tip.offsetHeight - 10)}px`;
  }

  function hideTip() { $('tooltip').classList.add('hidden'); }

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
