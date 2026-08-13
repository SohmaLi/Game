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
    else if (tab === 'mastery') renderMastery();
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
          const rankTag = n.rank > 1 ? `<span class="rank-badge">Bậc ${n.rank}/${n.maxRank}</span>` : '';
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
              ${rankTag}
            </div>`;
        }).join('')}
      </div>`;

    // Chuột phải luôn xem được chi tiết, kể cả nút chưa học. Trái: học nếu mở
    // được, xem chi tiết nếu đã học rồi (trước đây không có gì xảy ra).
    pane.querySelectorAll('.node').forEach((el) => {
      const n = nodes.find((x) => x.id === el.dataset.id);
      if (!n) return;
      el.oncontextmenu = (e) => nodeMenu(e, n);
      if (n.learned) el.onclick = () => nodeDetail(n);
      else if (!n.blocked) el.onclick = () => learn(n);
    });
  }

  /** Menu chuột phải cho một nút Cây Nền — cả đã học lẫn chưa học. */
  function nodeMenu(e, n) {
    e.preventDefault();
    const items = [{ icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => nodeDetail(n) }];

    if (n.learned && n.skill && n.maxRank) {
      const maxed = n.rank >= n.maxRank;
      const pts = data.skillPoints || 0;
      items.push({
        icon: '▲',
        label: maxed ? `Đã đạt bậc tối đa (${n.maxRank})` : `Nâng bậc ${n.rank} → ${n.rank + 1} (1đ)`,
        disabled: maxed || pts < 1,
        onClick: () => rankUp(n.skill.id, n.name),
      });
    } else if (!n.learned && !n.blocked) {
      items.push({ icon: '＋', label: 'Học kỹ năng', onClick: () => learn(n) });
    }

    UI.menu(e, {
      title: n.name,
      subtitle: n.learned ? (n.rank ? `Đã học · Bậc ${n.rank}/${n.maxRank}` : 'Đã học') : (n.blocked || 'Có thể học'),
      color: '#7dd3fc',
      items,
    });
  }

  /** Chi tiết một nút Cây Nền — chủ động thì mượn khuôn skillDetail, bị động tự dựng. */
  function nodeDetail(n) {
    if (n.skill) return skillDetail({ ...n.skill, rank: n.rank, maxRank: n.maxRank });
    UI.itemDetail({
      name: n.name,
      rarityName: n.learned ? 'Bị động · Đã học' : (n.blocked || 'Bị động · Chưa học'),
      level: `Cấp ${n.level}`,
      slot: 'skill',
      stats: {},
      passives: [{ name: 'Mô tả', desc: n.desc || '' }],
    }, '#d3b8f0');
  }

  /** Tiêu 1 điểm kỹ năng để nâng bậc — dùng chung cho cả 3 tab. */
  function rankUp(skillId, name) {
    socket.emit('skill:rank', { skillId }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không nâng được', res?.error || '');
      Panel.toast('levelup', `${name || 'Kỹ năng'} lên Bậc ${res.rank}`,
        `+${Math.round((res.rank - 1) * 10)}% sức mạnh so với bậc 1`);
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

    const items = [{ icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => skillDetail(skill) }];

    if (skill.maxRank) {
      const maxed = skill.rank >= skill.maxRank;
      items.push({
        icon: '▲',
        label: maxed ? `Đã đạt bậc tối đa (${skill.maxRank})` : `Nâng bậc ${skill.rank} → ${skill.rank + 1} (1đ)`,
        disabled: maxed || (data.skillPoints || 0) < 1,
        onClick: () => rankUp(skill.id, skill.name),
      });
    }

    items.push(
      carried_
        ? { icon: '↩', label: 'Tháo khỏi bộ mang theo',
            onClick: () => setLoadout(list.filter((id) => id !== skill.id)) }
        : { icon: Icons.svg('ui-equip') || '⬆', label: 'Mang vào trận',
            disabled: list.length >= max,
            onClick: () => setLoadout([...list, skill.id]) },
    );

    UI.menu(e, {
      title: skill.name,
      subtitle: carried_ ? 'Đang mang vào trận' : 'Đã mở, chưa mang',
      color: '#7dd3fc',
      items,
    });
  }

  /** Cửa sổ chi tiết kỹ năng, dựng theo cùng khuôn với chi tiết vật phẩm. */
  function skillDetail(skill, note = null) {
    const skillId = skill.id || skill.skillId;
    const rows = [];
    if (skill.manaCost) rows.push(['Tiêu hao', `${skill.manaCost} mana`]);
    if (skill.rage > 0) rows.push(['Tiêu hao', `${skill.rage} Nộ Khí`]);
    if (skill.rage < 0) rows.push(['Sinh ra', `${-skill.rage} Nộ Khí`]);
    rows.push(['Hồi chiêu', skill.cooldown ? `${skill.cooldown} vòng` : 'không']);
    rows.push(['Mục tiêu', targetLabel(skill.target)]);
    rows.push(['Loại', kindLabel(skill.kind)]);
    if (skill.maxRank) {
      const rank = skill.rank || 1;
      rows.push(['Bậc', `${rank} / ${skill.maxRank}${rank >= skill.maxRank ? ' · tối đa' : ''}`]);
    }

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

    /**
     * Nút nâng bậc bằng điểm — chỉ hiện khi `rank` đã được server tính, nghĩa
     * là kỹ năng đang thật sự mở/gắn. Một cuốn sách Dị Điển còn nằm trong túi
     * chưa gắn ô nào thì không có trường này, nên không hiện nút gây hiểu lầm
     * (bấm vào chỉ nhận về "Kỹ năng chưa mở").
     */
    if (skill.maxRank && (skill.rank || 1) < skill.maxRank && skillId) {
      const pts = data.skillPoints || 0;
      const btn = document.createElement('button');
      btn.className = 'btn-ok';
      btn.textContent = pts < 1 ? 'Không đủ điểm kỹ năng' : `Nâng bậc ${skill.rank || 1} → ${(skill.rank || 1) + 1} (1đ)`;
      btn.disabled = pts < 1;
      btn.onclick = () => { UI.closeModal(); rankUp(skillId, skill.name); };
      const actions = box.querySelector('.modal-actions');
      actions.insertBefore(btn, actions.firstChild);
    }
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
    if (s.rank > 1) parts.push(`<span class="rankb">Bậc ${s.rank}</span>`);
    if (s.manaCost) parts.push(`<span class="mana">${s.manaCost} mana</span>`);
    if (s.rage > 0) parts.push(`<span class="rage">${s.rage} nộ</span>`);
    if (s.cooldown) parts.push(`chờ ${s.cooldown}`);
    return parts.join(' · ') || 'miễn phí';
  };

  /* ------------------------------------------------ Tinh Thông ------- */

  /**
   * Chỗ tiêu cuối cùng của điểm kỹ năng.
   *
   * Cây Nền tốn 15 điểm, nâng bậc hết sáu chiêu tốn 24 — cấp 60 nhận 60 điểm
   * nên dư 21 điểm không tiêu vào đâu được. Bảng này phải nói thẳng con số đó
   * ra ngay dòng đầu, nếu không người chơi vẫn ngồi nhìn "0 điểm kỹ năng" ở
   * góc mà không biết mình đang thừa hay thiếu.
   */
  function renderMastery() {
    const pane = $('paneMastery');
    const lines = data.mastery || [];
    const pts = data.skillPoints || 0;
    const spent = lines.reduce((s, m) => s + (m.costs || []).slice(0, m.tier).reduce((a, b) => a + b, 0), 0);

    pane.innerHTML = `
      <p class="load-info">
        <b>Tinh Thông</b> — chỗ tiêu điểm kỹ năng sau khi Cây Nền đã mở hết và các chiêu đã kịch bậc.
        <br>Giá mỗi nấc tăng dần <b>1 · 1 · 2 · 2 · 3</b>: đi hết một dòng tốn <b>9 điểm</b>,
        cả sáu dòng tốn <b>${data.masteryCapacity || 54}</b> — không ai gom đủ, nên phải chọn.
        <br><span class="load-hint">Đã dồn ${spent} điểm · còn ${pts} điểm chưa tiêu.</span>
      </p>

      <div class="mst-grid">
        ${lines.map((m) => {
          const full = m.tier >= m.maxTier;
          const can = !m.blocked;
          const pips = Array.from({ length: m.maxTier }, (_, i) =>
            `<i class="mst-pip${i < m.tier ? ' on' : ''}">${m.costs?.[i] ?? 1}</i>`).join('');
          return `
            <div class="mst-line ${full ? 'full' : (can ? 'can' : 'blocked')}" data-line="${m.id}">
              <div class="mst-head">
                <span class="mst-name">${esc(m.name)}</span>
                <span class="mst-tier">${m.tier}/${m.maxTier}</span>
              </div>
              <div class="mst-pips">${pips}</div>
              <div class="mst-now">${m.value ? esc(m.value) : '<span class="dim">chưa đầu tư</span>'}</div>
              <div class="mst-desc">${esc(m.desc)}</div>
              <button class="mst-btn" data-buy="${m.id}" ${can ? '' : 'disabled'}>
                ${full ? 'Đã kịch nấc' : (can ? `${esc(m.per)} — ${m.cost}đ` : esc(m.blocked))}
              </button>
            </div>`;
        }).join('')}
      </div>`;

    // Rửa kỹ năng nằm ở đây chứ không ở tab Cây Nền: đây là tab duy nhất nhìn
    // thấy được TOÀN BỘ chỗ điểm đã đi đâu, nên cũng là chỗ hợp lý để lấy lại
    const price = data.respecPrice?.skills;
    if (price) {
      const wrap = document.createElement('div');
      wrap.className = 'mst-respec';
      wrap.innerHTML = `
        <div>
          <b>Rửa điểm kỹ năng</b>
          <span>Cây Nền, bậc từng chiêu và Tinh Thông về 0, trả lại toàn bộ điểm.
            Dị Điển đang gắn <b>không</b> bị đụng tới.</span>
        </div>
        <button class="respec-btn" ${(data.gold || 0) >= price ? '' : 'disabled'}>
          ${price.toLocaleString('vi-VN')} <i class="respec-gold" data-icon="ui-gold">◆</i>
        </button>`;
      Icons.paint(wrap);
      wrap.querySelector('button').onclick = () => confirmRespecSkills(price);
      pane.appendChild(wrap);
    }

    pane.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.onclick = () => buyMastery(btn.dataset.buy);
    });
  }

  async function confirmRespecSkills(price) {
    const ok = await UI.confirm({
      title: 'Rửa điểm kỹ năng?',
      message: `Toàn bộ Cây Nền, bậc từng chiêu và Tinh Thông về <b>0</b>, điểm trả lại hết
        để phân bổ từ đầu.<br><br>
        Tốn <b style="color:#ffd166">${price.toLocaleString('vi-VN')} vàng</b>.<br><br>
        <span class="warn">Sách Dị Điển đang gắn giữ nguyên — chỉ những chiêu học từ Cây Nền
        mới rời khỏi bộ mang theo.</span>`,
      confirmLabel: `Rửa — ${price.toLocaleString('vi-VN')} vàng`,
      danger: true,
    });
    if (!ok) return;

    socket.emit('respec:skills', {}, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không rửa được', res?.error || '');
      Panel.toast('levelup', `Trả lại ${res.points} điểm kỹ năng`,
        `−${res.price.toLocaleString('vi-VN')} vàng`);
    });
  }

  function buyMastery(lineId) {
    socket.emit('mastery:learn', { lineId }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không đầu tư được', res?.error || '');
      const line = (data.mastery || []).find((m) => m.id === lineId);
      Panel.toast('levelup', `${line?.name || 'Tinh Thông'} nấc ${res.tier}`, line?.per || '');
    });
  }

  /* ------------------------------------------------ Dị Điển ---------- */

  function renderCodex() {
    const pane = $('paneCodex');
    const slots = data.codex || [];
    const books = data.books || [];
    // Sách nào đang trùng một kỹ năng ĐÃ GẮN thì có thể tiêu để nâng bậc, thay
    // vì nằm không trong "chưa gắn" — đúng thứ người chơi phàn nàn: quá nhiều
    // sách trùng mà ô thì chỉ có 10.
    const socketedIds = new Set(slots.filter(Boolean).map((b) => b.skillId));

    pane.innerHTML = `
      <p class="load-info">
        <b>${data.codexSlots || 10} ô Dị Điển</b> — điền bằng sách rơi từ quái.
        <br>Mỗi kỹ năng chỉ chiếm <b>một ô</b>: ô thứ hai của cùng một chiêu không cho thêm gì cả.
        <br>Sách trùng kỹ năng đang gắn tiêu được để nâng bậc — <b>miễn phí</b>, không tốn điểm kỹ năng.
        <br><span style="color:#ff9aa8">Gắn đè, hay gỡ khỏi ô, đều xoá vĩnh viễn sách cũ.</span>
        Sách <b>chưa gắn</b> thì bán được cho thương nhân ở Bến Cảng Duskmoor.
        <br><span class="load-hint">Chuột phải vào một ô hoặc một cuốn sách để xem chi tiết, gỡ, hoặc vứt.</span>
      </p>

      <div class="codex-grid">
        ${Array.from({ length: data.codexSlots || 10 }, (_, i) => {
          const b = slots[i];
          const rankTag = b?.rank > 1 ? `<span class="rank-badge">Bậc ${b.rank}/${b.maxRank}</span>` : '';
          return b
            ? `<div class="codex-slot" data-slot="${i}" title="${esc(b.desc || '')}">
                 <span class="cx-num">${i + 1}</span>
                 <div class="cx-name">${esc(b.name || 'Sách')}</div>
                 <div class="cx-from">từ ${esc(b.from || '?')}</div>
                 ${rankTag}
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
        ${books.map((b) => {
          const at = slots.findIndex((s) => s?.skillId === b.skillId);
          const dup = at >= 0;
          // Kỹ năng đã kịch bậc thì cuốn trùng không còn tác dụng gì — nói
          // thẳng ra, đừng để người chơi bấm rồi mới ăn câu từ chối của server
          const maxed = dup && (slots[at].rank || 1) >= (slots[at].maxRank || 5);
          return `
          <div class="pool-item ${dup ? 'dup' : ''}" data-book="${b.uid}" title="${esc(b.desc || '')}">
            <div class="sk-name">${esc(b.name || 'Sách')}</div>
            <div class="sk-cost">từ ${esc(b.from || '?')}${dup ? ` · đang gắn ở ô ${at + 1}` : ''}</div>
            ${dup && !maxed ? `<button class="up-btn" data-upgrade="${b.uid}">Sách trùng — nâng bậc</button>` : ''}
            ${maxed ? '<div class="sk-cost" style="color:#8b95ab">Đã kịch bậc — bán hoặc vứt</div>' : ''}
          </div>`;
        }).join('')}
      </div>` : `<p class="books-empty">
        Chưa có sách nào. Sách Dị Điển rơi từ quái với tỉ lệ <b>5%</b> (quái Tinh Anh 15%,
        Thủ Lĩnh 40%). Đặc Ân <b>Duyên Kho Báu</b> làm tăng tỉ lệ này.
      </p>`}`;

    let picked = null;

    pane.querySelectorAll('[data-book]').forEach((el) => {
      const uid = el.dataset.book;
      const book = books.find((b) => b.uid === uid);
      el.oncontextmenu = (e) => bookMenu(e, book);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.up-btn')) return; // nút riêng tự xử lý, khỏi chọn để gắn
        picked = uid;
        pane.querySelectorAll('[data-book]').forEach((x) => x.classList.remove('taken'));
        el.classList.add('taken');
        Panel.toast('item', 'Đã chọn sách', 'Giờ bấm vào một ô Dị Điển để gắn');
      });
    });

    pane.querySelectorAll('[data-upgrade]').forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); upgradeBook(btn.dataset.upgrade); };
    });

    pane.querySelectorAll('[data-slot]').forEach((el) => {
      const slot = parseInt(el.dataset.slot, 10);
      const old = slots[slot];
      if (old) el.oncontextmenu = (e) => slotMenu(e, old, slot);

      el.onclick = async () => {
        if (!picked) {
          if (old) return skillDetail(old, `Dị Điển · Ô ${slot + 1}`);
          return Panel.toast('warn', 'Chưa chọn sách', 'Bấm một cuốn ở danh sách dưới trước');
        }

        // Chặn ngay ở đây thay vì để server từ chối: người chơi vừa bấm hai
        // lần mới nhận được câu "không được", trong khi cái nút đúng
        // ("nâng bậc") đang nằm ngay trên cuốn sách họ vừa chọn
        const chosen = books.find((b) => b.uid === picked);
        const dupAt = slots.findIndex((b, i) => b?.skillId === chosen?.skillId && i !== slot);
        if (dupAt >= 0) {
          return Panel.toast('warn', `Kỹ năng này đã gắn ở ô ${dupAt + 1}`,
            'Ô thứ hai không cho thêm gì — tiêu cuốn này để nâng bậc thay vì gắn');
        }

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

  /** Menu chuột phải cho một cuốn sách CHƯA gắn. */
  function bookMenu(e, book) {
    e.preventDefault();
    if (!book) return;

    const items = [{ icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => skillDetail(book, 'Dị Điển · chưa gắn') }];

    const socketed = (data.codex || []).find((b) => b?.skillId === book.skillId);
    if (socketed) {
      const rank = socketed.rank || 1;
      const maxed = rank >= (socketed.maxRank || 5);
      items.push({
        icon: '▲',
        label: maxed ? 'Kỹ năng đang gắn đã đạt bậc tối đa' : `Tiêu sách này — nâng bậc ${rank} → ${rank + 1}`,
        disabled: maxed,
        onClick: () => upgradeBook(book.uid),
      });
    }

    items.push({
      icon: Icons.svg('ui-trash') || '🗑',
      label: 'Vứt cuốn này',
      danger: true,
      onClick: () => discardBook(book),
    });

    UI.menu(e, {
      title: book.name,
      subtitle: socketed ? 'Trùng kỹ năng đang gắn' : 'Chưa gắn ô nào',
      color: '#d3b8f0',
      items,
    });
  }

  /** Menu chuột phải cho một ô Dị Điển đã gắn sách. */
  function slotMenu(e, book, slot) {
    e.preventDefault();
    UI.menu(e, {
      title: book.name,
      subtitle: `Đang gắn ở ô ${slot + 1}${book.rank > 1 ? ` · Bậc ${book.rank}/${book.maxRank}` : ''}`,
      color: '#d3b8f0',
      items: [
        { icon: Icons.svg('ui-detail') || '🔍', label: 'Xem chi tiết', onClick: () => skillDetail(book, `Dị Điển · Ô ${slot + 1}`) },
        { icon: Icons.svg('ui-trash') || '🗑', label: 'Gỡ khỏi ô — xoá sách', danger: true, onClick: () => unsocket(book, slot) },
      ],
    });
  }

  /**
   * Gỡ sách khỏi ô. Sách đi luôn, nên hỏi lại — và nói rõ cả hai thứ sẽ mất
   * theo: chiêu rời khỏi bộ mang theo, và bậc đã nâng bằng điểm quay về túi
   * còn bậc nâng bằng sách thì mất hẳn.
   */
  async function unsocket(book, slot) {
    const ranked = (book.rank || 1) > 1;
    const ok = await UI.confirm({
      title: 'Gỡ sách khỏi ô này?',
      message: `Ô ${slot + 1}: <b style="color:#d3b8f0">${UI.esc(book.name)}</b><br><br>
        <span class="warn">Sách bị xoá vĩnh viễn — không lấy lại được, và quầy hàng không bán sách.</span>
        ${ranked ? `<br><br>Kỹ năng này đang ở <b>Bậc ${book.rank}/${book.maxRank}</b>.
          Bậc mua bằng điểm kỹ năng sẽ được hoàn lại; bậc nâng bằng sách trùng thì mất theo.` : ''}
        <br><br>Muốn giữ lại thì bán ở chỗ thương nhân — nhưng chỉ bán được sách CHƯA gắn.`,
      confirmLabel: 'Gỡ và xoá',
      danger: true,
    });
    if (!ok) return;

    socket.emit('codex:unsocket', { slot }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không gỡ được', res?.error || '');
      Panel.toast('item', 'Đã gỡ khỏi Dị Điển', res.removed || '');
    });
  }

  /** Vứt một cuốn sách CHƯA gắn. */
  async function discardBook(book) {
    const ok = await UI.confirm({
      title: 'Vứt cuốn này?',
      message: `<b style="color:#d3b8f0">${UI.esc(book.name)}</b> — từ ${UI.esc(book.from || '?')}<br><br>
        <span class="warn">Xoá vĩnh viễn, không lấy lại được.</span><br><br>
        Đứng cạnh thương nhân ở Bến Cảng Duskmoor thì bán được lấy vàng, thay vì vứt không.`,
      confirmLabel: 'Vứt đi',
      danger: true,
    });
    if (!ok) return;

    socket.emit('codex:discard', { uids: [book.uid] }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không vứt được', res?.error || '');
      Panel.toast('item', 'Đã vứt sách', book.name || '');
    });
  }

  /** Tiêu một cuốn sách trùng để nâng bậc kỹ năng đang gắn — miễn phí, không tốn điểm. */
  function upgradeBook(uid) {
    socket.emit('codex:upgrade', { uid }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Không nâng được', res?.error || '');
      Panel.toast('levelup', `Lên Bậc ${res.rank}`, 'Đã tiêu sách trùng để nâng cấp');
    });
  }

  /* ------------------------------------------------ tiện ích --------- */

  const classLabel = (id) => ({ warrior: 'Chiến Binh', mage: 'Pháp Sư' }[id] || id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { init, update, open, close, toggle, isOpen };
})();
