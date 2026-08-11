'use strict';

/**
 * Cây kỹ năng: chọn lớp · Cây Nền · Dị Điển · chọn chiêu mang vào trận.
 *
 * Giống bảng nhân vật, không giữ trạng thái riêng — mọi thao tác gửi lên
 * server rồi vẽ lại từ dữ liệu server trả về. Học kỹ năng là hành động không
 * hoàn tác được, càng không được để client và server hiểu khác nhau.
 */

const Tree = (() => {
  const $ = (id) => document.getElementById(id);

  /** Khoảng cách giữa các nút khi vẽ lưới, tính theo pixel. */
  const CELL = { w: 210, h: 96 };

  let socket = null;
  let data = null;
  let tab = 'tree';

  /* ------------------------------------------------ khởi tạo ---------- */

  function init(sock) {
    socket = sock;
    $('treeClose').onclick = close;
    $('tree').addEventListener('click', (e) => { if (e.target.id === 'tree') close(); });

    document.querySelectorAll('.t-tab').forEach((btn) => {
      btn.onclick = () => { tab = btn.dataset.tab; render(); };
    });
  }

  function isOpen() { return !$('tree').classList.contains('hidden'); }
  function close() { $('tree').classList.add('hidden'); }
  function open() {
    Panel.close();
    $('tree').classList.remove('hidden');
    render();
  }
  function toggle() { isOpen() ? close() : open(); }

  function update(c) {
    data = c;
    if (isOpen()) render();
  }

  /* ------------------------------------------------ vẽ --------------- */

  function render() {
    if (!data) return;

    const pts = data.skillPoints || 0;
    $('treePoints').textContent = `${pts} điểm kỹ năng`;
    $('treePoints').classList.toggle('zero', pts === 0);
    $('treeClass').textContent = data.className
      ? classLabel(data.className)
      : 'Chưa chọn lớp';

    document.querySelectorAll('.t-tab').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.t-pane').forEach((p) =>
      p.classList.toggle('active', p.dataset.pane === tab));

    if (!data.className) return renderClassPick();

    if (tab === 'tree') renderTree();
    else if (tab === 'loadout') renderLoadout();
    else renderCodex();
  }

  /* ------------------------------------------------ chọn lớp --------- */

  function renderClassPick() {
    // Chưa chọn lớp thì mọi tab đều vô nghĩa — ép về màn chọn lớp
    document.querySelectorAll('.t-pane').forEach((p) => p.classList.remove('active'));
    const pane = $('paneTree');
    pane.classList.add('active');

    pane.innerHTML = `
      <div class="class-pick">
        ${(data.classes || []).map((c) => `
          <div class="class-card" data-class="${c.id}">
            <h4>${esc(c.name)}</h4>
            <div class="role">${esc(c.role)}</div>
            <p>${esc(c.desc)}</p>
          </div>`).join('')}
      </div>
      <div class="class-warn">
        ⚠ Chọn lớp xong chỉ đổi được ở mốc cấp <b>10, 25, 50</b>, và đổi thì Cây Nền
        bị reset (hoàn lại toàn bộ điểm). Cân nhắc trước khi chọn.
      </div>`;

    pane.querySelectorAll('.class-card').forEach((card) => {
      card.onclick = async () => {
        const id = card.dataset.class;
        const name = data.classes.find((c) => c.id === id)?.name || id;
        const ok = await UI.confirm({
          title: `Chọn lớp ${UI.esc(name)}?`,
          message: `Lớp quyết định tài nguyên và toàn bộ Cây Nền của nhân vật.<br><br>
            <span class="warn">Chỉ đổi được ở mốc cấp 10, 25, 50.</span>`,
          confirmLabel: 'Chọn lớp này',
        });
        if (!ok) return;
        socket.emit('class:choose', { classId: id }, (res) => {
          if (!res?.ok) Panel.toast('warn', 'Không chọn được', res?.error || '');
        });
      };
    });
  }

  /* ------------------------------------------------ Cây Nền ---------- */

  function renderTree() {
    const pane = $('paneTree');
    const nodes = data.tree || [];
    if (!nodes.length) { pane.innerHTML = '<p class="books-empty">Lớp này chưa có cây kỹ năng.</p>'; return; }

    const maxX = Math.max(...nodes.map((n) => n.pos.x));
    const maxY = Math.max(...nodes.map((n) => n.pos.y));
    const width = (maxX + 1) * CELL.w;
    const height = (maxY + 1) * CELL.h + 20;

    const at = (n) => ({ x: n.pos.x * CELL.w, y: n.pos.y * CELL.h });

    // Đường nối vẽ bằng SVG, nằm dưới các nút
    const lines = [];
    for (const n of nodes) {
      for (const reqId of n.requires) {
        const req = nodes.find((m) => m.id === reqId);
        if (!req) continue;
        const a = at(req);
        const b = at(n);
        const on = req.learned && n.learned;
        lines.push(`<line x1="${a.x + 74}" y1="${a.y + 56}" x2="${b.x + 74}" y2="${b.y + 8}"
          stroke="${on ? '#46c46b' : '#2b3651'}" stroke-width="2"
          ${req.learned && !n.learned ? 'stroke-dasharray="4 4"' : ''} />`);
      }
    }

    pane.innerHTML = `
      <div class="t-grid" style="width:${width}px;height:${height}px">
        <svg class="t-lines" width="${width}" height="${height}">${lines.join('')}</svg>
        ${nodes.map((n) => {
          const p = at(n);
          const state = n.learned ? 'learned' : (n.blocked ? 'blocked' : 'available');
          return `
            <div class="node ${state} ${n.capstone ? 'capstone' : ''}"
                 data-id="${n.id}" style="left:${p.x}px;top:${p.y}px"
                 title="${esc(n.blocked || n.desc)}">
              <div class="node-top">
                <span class="node-name">${n.skillId ? Icons.svg(`sk-${n.skillId}`, { cls: 'gi-sk' }) : ''}${esc(n.name)}</span>
                <span class="node-cost">${n.cost}đ</span>
              </div>
              <div class="node-kind ${n.type}">${n.type === 'active' ? 'Chủ động' : 'Bị động'}</div>
              <div class="node-lv">Cấp ${n.level}${n.blocked ? ` · ${esc(n.blocked)}` : ''}</div>
            </div>`;
        }).join('')}
      </div>`;

    pane.querySelectorAll('.node').forEach((el) => {
      const n = nodes.find((x) => x.id === el.dataset.id);
      if (!n || n.learned || n.blocked) return;
      el.onclick = () => learn(n);
    });
  }

  async function learn(n) {
    const ok = await UI.confirm({
      title: `Học ${UI.esc(n.name)}?`,
      message: `${esc(n.desc)}<br><br>Tốn <b>${n.cost}</b> điểm kỹ năng.
        <span style="color:#6b7791">Điểm đã tiêu không hoàn lại (trừ khi đổi lớp).</span>`,
      confirmLabel: 'Học',
    });
    if (!ok) return;
    socket.emit('tree:learn', { nodeId: n.id }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không học được', res?.error || '');
      const note = !res.active ? 'Bị động, luôn có tác dụng'
        : res.carried ? 'Đã mang vào trận'
          : 'Bộ mang theo đã đầy — vào tab Mang Theo để đổi';
      Panel.toast('levelup', `Đã học ${n.name}`, note);
    });
  }

  /* ------------------------------------------------ mang theo -------- */

  function renderLoadout() {
    const pane = $('paneLoadout');
    const carried = data.carried || [];
    const unlocked = data.unlocked || [];
    const max = data.maxLoadout || 10;

    const byId = new Map(unlocked.map((s) => [s.id, s]));

    // Đã mở chiêu mà chưa mang thì phải nói thẳng ra. Không có dòng này, người
    // chơi cộng điểm xong vào trận không thấy chiêu đâu và tưởng game hỏng.
    const idle = unlocked.filter((s) => !carried.includes(s.id));
    const room = max - carried.length;
    const warn = idle.length && room > 0
      ? `<div class="load-warn">
           <span>${carried.length ? `Còn <b>${idle.length}</b> kỹ năng đã mở chưa mang vào trận.`
             : '<b>Chưa mang kỹ năng nào</b> — vào trận bạn chỉ có Đánh Thường và Phòng Thủ.'}</span>
           <button id="loadFillAll">Mang tất cả</button>
         </div>`
      : '';

    pane.innerHTML = `
      <p class="load-info">
        Mang tối đa <b>${max}</b> kỹ năng vào trận — đang mang <b>${carried.length}</b>.
        <br>Bấm vào ô đang có để bỏ ra, bấm ở danh sách dưới để thêm vào.
        <br><span style="color:#6b7791">Đánh Thường và Phòng Thủ là bẩm sinh, không chiếm ô.</span>
      </p>
      ${warn}

      <div class="load-slots">
        ${(data.innate || []).map((s) => `
          <div class="load-slot innate" title="Bẩm sinh — không chiếm ô">
            <div class="sk-name">${esc(s.name)}</div>
            <div class="sk-cost">bẩm sinh</div>
          </div>`).join('')}

        ${Array.from({ length: max }, (_, i) => {
          const s = byId.get(carried[i]);
          return s
            ? `<div class="load-slot" data-remove="${s.id}" title="Bấm để bỏ khỏi bộ mang theo">
                 <div class="sk-name">${esc(s.name)}</div>
                 <div class="sk-cost">${costText(s)}</div>
               </div>`
            : `<div class="load-slot empty">ô trống</div>`;
        }).join('')}
      </div>

      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:#6b7791;margin-bottom:9px">
        Kỹ năng đã mở (${unlocked.length})
      </h3>
      ${unlocked.length ? `<div class="pool">
        ${unlocked.map((s) => {
          const taken = carried.includes(s.id);
          return `<div class="pool-item ${taken ? 'taken' : ''}" data-add="${s.id}" title="${esc(s.desc)}">
            <div class="sk-name">${esc(s.name)}</div>
            <div class="sk-cost">${taken ? 'đang mang' : costText(s)}</div>
          </div>`;
        }).join('')}
      </div>` : '<p class="books-empty">Chưa mở kỹ năng chủ động nào. Vào tab Cây Nền để học.</p>'}`;

    const fill = $('loadFillAll');
    if (fill) {
      fill.onclick = () => setLoadout([...carried, ...idle.map((s) => s.id)].slice(0, max));
    }

    // Đang mang: bấm để tháo, chuột phải để xem thêm
    pane.querySelectorAll('[data-remove]').forEach((el) => {
      const s = byId.get(el.dataset.remove);
      el.onclick = () => setLoadout(carried.filter((id) => id !== el.dataset.remove));
      el.oncontextmenu = (e) => skillMenu(e, s, true, carried, max);
    });

    // Trong danh sách đã mở: bấm để mang, chuột phải để xem thêm
    pane.querySelectorAll('[data-add]').forEach((el) => {
      const id = el.dataset.add;
      const s = byId.get(id);
      el.oncontextmenu = (e) => skillMenu(e, s, carried.includes(id), carried, max);
      if (carried.includes(id)) return;
      el.onclick = () => {
        if (carried.length >= max) return Panel.toast('warn', 'Đã đầy', `Tối đa ${max} kỹ năng`);
        setLoadout([...carried, id]);
      };
    });

    // Kỹ năng bẩm sinh chỉ xem được, không tháo được
    pane.querySelectorAll('.load-slot.innate').forEach((el, i) => {
      const s = (data.innate || [])[i];
      el.oncontextmenu = (e) => {
        e.preventDefault();
        UI.menu(e, {
          title: s.name,
          subtitle: 'Bẩm sinh — không chiếm ô',
          items: [{ icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => skillDetail(s, 'Bẩm sinh') }],
        });
      };
    });
  }

  /**
   * Menu chuột phải cho kỹ năng — cùng bộ thao tác với vật phẩm để người chơi
   * không phải nhớ hai kiểu tương tác khác nhau.
   */
  function skillMenu(e, skill, carried_, list, max) {
    e.preventDefault();
    if (!skill) return;

    UI.menu(e, {
      title: skill.name,
      subtitle: carried_ ? 'Đang mang vào trận' : 'Đã mở, chưa mang',
      color: '#7dd3fc',
      items: [
        { icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => skillDetail(skill) },
        carried_
          ? { icon: '↩', label: 'Tháo khỏi bộ mang theo',
              onClick: () => setLoadout(list.filter((id) => id !== skill.id)) }
          : { icon: Icons.svg('ui-equip') || '⬆', label: 'Mang vào trận',
              disabled: list.length >= max,
              onClick: () => setLoadout([...list, skill.id]) },
      ],
    });
  }

  /** Cửa sổ chi tiết kỹ năng, dựng theo cùng khuôn với chi tiết vật phẩm. */
  function skillDetail(skill, note = null) {
    const rows = [];
    if (skill.manaCost) rows.push(['Tiêu hao', `${skill.manaCost} mana`]);
    if (skill.rage > 0) rows.push(['Tiêu hao', `${skill.rage} Nộ Khí`]);
    if (skill.rage < 0) rows.push(['Sinh ra', `${-skill.rage} Nộ Khí`]);
    rows.push(['Hồi chiêu', skill.cooldown ? `${skill.cooldown} vòng` : 'không']);
    rows.push(['Mục tiêu', targetLabel(skill.target)]);
    rows.push(['Loại', kindLabel(skill.kind)]);

    UI.itemDetail({
      name: skill.name,
      rarityName: note || kindLabel(skill.kind),
      level: '—',
      slot: 'skill',
      stats: {},
      passives: [{ name: 'Mô tả', desc: skill.desc || '' }],
      _rows: rows,
    }, '#7dd3fc');

    // Chèn bảng thông số vào cửa sổ vừa mở
    const box = document.querySelector('.modal-box');
    if (!box) return;
    const block = document.createElement('div');
    block.className = 'detail-block';
    block.innerHTML = '<h4>Thông số</h4>' + rows.map(([k, v]) =>
      `<div class="detail-line"><span>${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
    box.insertBefore(block, box.querySelector('.modal-actions'));
  }

  const targetLabel = (t) => ({
    enemy: 'Một kẻ địch', ally: 'Một đồng đội', self: 'Bản thân',
    allEnemies: 'Toàn bộ kẻ địch', allAllies: 'Toàn đội',
  }[t] || t);

  const kindLabel = (k) => ({
    physical: 'Vật lý', magic: 'Phép thuật', heal: 'Hồi máu', buff: 'Tăng ích',
  }[k] || k);

  function setLoadout(list) {
    socket.emit('loadout:set', { skills: list }, (res) => {
      if (!res?.ok) Panel.toast('warn', 'Không đổi được', res?.error || '');
    });
  }

  const costText = (s) => {
    const parts = [];
    if (s.manaCost) parts.push(`<span class="mana">${s.manaCost} mana</span>`);
    if (s.rage > 0) parts.push(`<span class="rage">${s.rage} nộ</span>`);
    if (s.cooldown) parts.push(`chờ ${s.cooldown}`);
    return parts.join(' · ') || 'miễn phí';
  };

  /* ------------------------------------------------ Dị Điển ---------- */

  function renderCodex() {
    const pane = $('paneCodex');
    const slots = data.codex || [];
    const books = data.books || [];

    pane.innerHTML = `
      <p class="load-info">
        <b>${data.codexSlots || 10} ô Dị Điển</b> — điền bằng sách rơi từ quái.
        <br><span style="color:#ff9aa8">Gắn đè lên ô đã có sẽ xoá vĩnh viễn sách cũ.</span>
      </p>

      <div class="codex-grid">
        ${Array.from({ length: data.codexSlots || 10 }, (_, i) => {
          const b = slots[i];
          return b
            ? `<div class="codex-slot" data-slot="${i}" title="${esc(b.desc || '')}">
                 <span class="cx-num">${i + 1}</span>
                 <div class="cx-name">${esc(b.name || 'Sách')}</div>
                 <div class="cx-from">từ ${esc(b.from || '?')}</div>
               </div>`
            : `<div class="codex-slot empty" data-slot="${i}">
                 <span class="cx-num">${i + 1}</span>ô trống
               </div>`;
        }).join('')}
      </div>

      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:#6b7791;margin-bottom:9px">
        Sách chưa gắn (${books.length})
      </h3>
      ${books.length ? `<div class="pool">
        ${books.map((b) => `
          <div class="pool-item" data-book="${b.uid}" title="${esc(b.desc || '')}">
            <div class="sk-name">${esc(b.name || 'Sách')}</div>
            <div class="sk-cost">từ ${esc(b.from || '?')}</div>
          </div>`).join('')}
      </div>` : `<p class="books-empty">
        Chưa có sách nào. Sách Dị Điển rơi từ quái với tỉ lệ <b>5%</b> (quái Tinh Anh 15%,
        Thủ Lĩnh 40%). Đặc Ân <b>Duyên Kho Báu</b> làm tăng tỉ lệ này.
      </p>`}`;

    let picked = null;
    pane.querySelectorAll('[data-book]').forEach((el) => {
      el.onclick = () => {
        picked = el.dataset.book;
        pane.querySelectorAll('[data-book]').forEach((x) => x.classList.remove('taken'));
        el.classList.add('taken');
        Panel.toast('item', 'Đã chọn sách', 'Giờ bấm vào một ô Dị Điển để gắn');
      };
    });

    pane.querySelectorAll('[data-slot]').forEach((el) => {
      el.onclick = async () => {
        if (!picked) return Panel.toast('warn', 'Chưa chọn sách', 'Bấm một cuốn ở danh sách dưới trước');
        const slot = parseInt(el.dataset.slot, 10);
        const old = slots[slot];

        if (old) {
          const ok = await UI.confirm({
            title: 'Ghi đè ô này?',
            message: `Ô ${slot + 1} đang có <b style="color:#d3b8f0">${UI.esc(old.name)}</b>.<br><br>
              <span class="warn">Gắn sách mới sẽ xoá vĩnh viễn sách cũ — không lấy lại được.</span>`,
            confirmLabel: 'Ghi đè',
            danger: true,
          });
          if (!ok) return;
        }

        socket.emit('codex:socket', { slot, uid: picked }, (res) => {
          if (res?.ok) {
            picked = null;
            Panel.toast('item', 'Đã gắn vào Dị Điển', res.replaced ? `Xoá: ${res.replaced}` : '');
          } else {
            Panel.toast('warn', 'Không gắn được', res?.error || '');
          }
        });
      };
    });
  }

  /* ------------------------------------------------ tiện ích --------- */

  const classLabel = (id) => ({ warrior: 'Chiến Binh', mage: 'Pháp Sư' }[id] || id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, update, open, close, toggle, isOpen };
})();
