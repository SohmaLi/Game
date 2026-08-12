'use strict';

/**
 * Đăng ký · đăng nhập · chọn nhân vật.
 *
 * Các màn nối tiếp nhau trước khi vào game:
 *   auth  →  chọn nhân vật (tối đa 3)  →  chọn bản đồ
 *              ↳ tạo nhân vật (nếu chưa có)
 *
 * Token lưu trong localStorage để lần sau vào thẳng. Đây là token có hạn 14
 * ngày và thu hồi được ở phía server, không phải mật khẩu — mật khẩu không bao
 * giờ được giữ lại ở client.
 */

const Account = (() => {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'frozen.token';

  let meta = null;      // danh sách đặc ân + quốc gia, lấy một lần
  let characters = [];
  let onReady = null;   // gọi khi người chơi đã chọn xong nhân vật

  /* ------------------------------------------------ tiện ích API ------ */

  const token = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

  async function api(path, { method = 'GET', body = null, auth = true } = {}) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
    return data;
  }

  /* ------------------------------------------------ khởi động --------- */

  async function start(cb) {
    onReady = cb;
    bind();

    try {
      meta = await api('/meta', { auth: false });
    } catch {
      return showAuth('Không kết nối được máy chủ. Thử tải lại trang.');
    }

    // Có token cũ thì vào thẳng màn chọn nhân vật
    if (token()) {
      try {
        const me = await api('/me');
        characters = me.characters;
        return showCharacters();
      } catch {
        setToken(null); // token hết hạn hoặc bị thu hồi
      }
    }
    showAuth();
  }

  function bind() {
    $('authSubmit').onclick = submitAuth;
    $('authToggle').onclick = () => {
      const isLogin = $('authMode').dataset.mode === 'login';
      $('authMode').dataset.mode = isLogin ? 'register' : 'login';
      renderAuthMode();
    };
    for (const id of ['authUser', 'authPass']) {
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    }
    $('charCreateBtn').onclick = () => showCreate();
    $('createBack').onclick = () => showCharacters();
    $('createSubmit').onclick = submitCreate;
    $('mapBack').onclick = () => showCharacters();
    $('logoutBtn').onclick = () => {
      api('/logout', { method: 'POST' }).catch(() => {});
      setToken(null);
      characters = [];
      showAuth();
    };
  }

  const screens = ['scrAuth', 'scrChars', 'scrCreate', 'scrMap'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
    $('menu').classList.remove('hidden');
  }

  /* ------------------------------------------------ màn đăng nhập ----- */

  function showAuth(err = '') {
    show('scrAuth');
    renderAuthMode();
    $('authError').textContent = err;
  }

  function renderAuthMode() {
    const isLogin = $('authMode').dataset.mode === 'login';
    $('authTitle').textContent = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
    $('authSubmit').textContent = isLogin ? 'Đăng nhập' : 'Đăng ký';
    $('authToggle').textContent = isLogin ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
    $('authHint').textContent = isLogin ? '' : 'Tên đăng nhập 3–32 ký tự (chữ, số, gạch dưới). Mật khẩu từ 8 ký tự.';
    $('authError').textContent = '';
  }

  async function submitAuth() {
    const isLogin = $('authMode').dataset.mode === 'login';
    const username = $('authUser').value.trim();
    const password = $('authPass').value;

    $('authSubmit').disabled = true;
    $('authError').textContent = '';
    try {
      const res = await api(isLogin ? '/login' : '/register', {
        method: 'POST', auth: false, body: { username, password },
      });
      setToken(res.token);
      $('authPass').value = '';

      const me = await api('/me');
      characters = me.characters;
      showCharacters();
    } catch (e) {
      $('authError').textContent = e.message;
    } finally {
      $('authSubmit').disabled = false;
    }
  }

  /* ------------------------------------------------ chọn nhân vật ----- */

  function showCharacters() {
    show('scrChars');
    const max = meta?.maxCharacters || 3;
    $('charCount').textContent = `${characters.length}/${max}`;
    $('charCreateBtn').style.display = characters.length >= max ? 'none' : '';

    const box = $('charList');
    box.innerHTML = characters.length ? '' :
      '<p class="ch-empty">Chưa có nhân vật nào. Tạo một cái để bắt đầu.</p>';

    for (const c of characters) {
      const el = document.createElement('div');
      el.className = 'ch-card';
      el.innerHTML = `
        <div class="ch-top">
          <span class="ch-name">${esc(c.name)}</span>
          <span class="ch-lv">Cấp ${c.level}</span>
        </div>
        <div class="ch-sub">${esc(c.nation?.name || '—')}${c.class ? ` · ${classLabel(c.class)}` : ' · chưa chọn lớp'}</div>
        <div class="ch-boon">★ ${esc(c.boon?.name || '—')} <span>${esc(c.boon?.star || '')}</span></div>
        <div class="ch-play">Vào chơi →</div>`;
      el.onclick = () => showMap(c);
      box.appendChild(el);
    }
  }

  /* ------------------------------------------------ chọn bản đồ ------- */

  /**
   * Sáu bản đồ, mỗi bản đồ 10 cấp, phủ kín cấp 1 tới 60.
   *
   * Chỉ mở bản đồ mà nhân vật đủ cấp. Vẫn cho quay về bản đồ thấp — muốn đi
   * dạo chỗ dễ là quyền của người chơi, chỉ có điều phần thưởng ở đó bèo bọt.
   * Đây thuần là lớp hiển thị: server tự kiểm tra lại lúc vào phòng.
   */
  function showMap(character) {
    show('scrMap');
    $('mapCharName').textContent = character.name;
    $('mapCharLevel').textContent = character.level;
    $('mapError').textContent = '';

    const box = $('zoneList');
    box.innerHTML = '';

    for (const z of meta.zones || []) {
      const locked = character.level < z.levelMin;
      const el = document.createElement('div');
      el.className = `zone-card${locked ? ' locked' : ''}`;
      el.style.setProperty('--accent', z.accent);
      el.innerHTML = `
        <div class="zn-top">
          <span class="zn-name">${esc(z.name)}</span>
          <span class="zn-range">Cấp ${z.levelMin}–${z.levelMax}</span>
        </div>
        <div class="zn-desc">${esc(z.desc)}</div>
        <div class="zn-foot">${locked
          ? `<span>🔒 Cần cấp ${z.levelMin}</span>`
          : '<span>◆ Thủ Lĩnh xuất hiện 5 phút một lần</span><span class="zn-go">Vào →</span>'}</div>`;

      if (!locked) {
        el.onclick = () => onReady?.({
          token: token(), characterId: character.id, zone: z.id, character,
        });
      }
      box.appendChild(el);
    }
  }

  /* ------------------------------------------------ tạo nhân vật ------ */

  function showCreate() {
    show('scrCreate');
    $('createError').textContent = '';
    $('createName').value = '';

    const box = $('nationList');
    box.innerHTML = '';
    for (const n of meta.nations) {
      const el = document.createElement('div');
      el.className = 'nation-card';
      el.dataset.id = n.id;
      el.innerHTML = `
        <div class="nt-name">${esc(n.name)}</div>
        <div class="nt-trait">${esc(n.trait)}</div>
        <div class="nt-priv">${esc(n.privilege.name)} — ${esc(n.privilege.desc)}</div>`;
      el.onclick = () => {
        box.querySelectorAll('.nation-card').forEach((c) => c.classList.remove('picked'));
        el.classList.add('picked');
      };
      box.appendChild(el);
    }
    box.firstElementChild?.classList.add('picked');
  }

  async function submitCreate() {
    const name = $('createName').value.trim();
    const nation = $('nationList').querySelector('.picked')?.dataset.id;

    $('createSubmit').disabled = true;
    $('createError').textContent = '';
    try {
      const res = await api('/characters', { method: 'POST', body: { name, nation } });
      characters.push(res.character);

      // Bốc Đặc Ân xong thì cho xem ngay — đây là khoảnh khắc đáng nhớ nhất
      // của việc tạo nhân vật, giấu nó đi thì phí
      await showBoonRoll(res.character);
      showCharacters();
    } catch (e) {
      $('createError').textContent = e.message;
    } finally {
      $('createSubmit').disabled = false;
    }
  }

  /**
   * Màn bốc Đặc Ân — cho rút lại tối đa 3 lần rồi khoá vĩnh viễn.
   */
  function showBoonRoll(character) {
    return new Promise((resolve) => {
      let c = character;

      const render = () => {
        const left = c.boonRerollsLeft;
        UI.closeModal();
        const el = document.createElement('div');
        el.className = 'modal';
        el.innerHTML = `
          <div class="modal-box">
            <h3 style="text-align:center">Vì sao của bạn</h3>
            <div class="boon-star">${esc(c.boon.star)}</div>
            <div class="boon-name">${esc(c.boon.name)}</div>
            <p style="text-align:center;margin-top:8px">${esc(c.boon.desc)}</p>
            <p style="text-align:center;margin-top:14px;color:#6b7791;font-size:12px">
              ${c.boonLocked
                ? 'Đã khoá vĩnh viễn.'
                : `Còn <b style="color:#93e0b0">${left}</b> lượt rút lại. Hết lượt sẽ tự khoá.`}
            </p>
            <div class="modal-actions">
              ${c.boonLocked ? '' : '<button class="btn-cancel" id="rerollBtn">Rút lại</button>'}
              <button class="btn-ok" id="keepBtn">${c.boonLocked ? 'Tiếp tục' : 'Giữ đặc ân này'}</button>
            </div>
          </div>`;
        document.body.appendChild(el);

        el.querySelector('#rerollBtn')?.addEventListener('click', async () => {
          try {
            const r = await api(`/characters/${c.id}/reroll`, { method: 'POST' });
            c = r.character;
            const i = characters.findIndex((x) => x.id === c.id);
            if (i >= 0) characters[i] = c;
            el.remove();
            render();
          } catch (e) {
            Panel.toast?.('warn', 'Không rút được', e.message);
          }
        });

        el.querySelector('#keepBtn').addEventListener('click', async () => {
          if (!c.boonLocked) {
            try {
              const r = await api(`/characters/${c.id}/lock-boon`, { method: 'POST' });
              const i = characters.findIndex((x) => x.id === r.character.id);
              if (i >= 0) characters[i] = r.character;
            } catch { /* khoá hụt không chặn người chơi vào game */ }
          }
          el.remove();
          resolve();
        });
      };
      render();
    });
  }

  /* ------------------------------------------------ tiện ích ---------- */

  const classLabel = (id) => ({ warrior: 'Chiến Binh', mage: 'Pháp Sư' }[id] || id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  return { start, showCharacters, showMap, token, api };
})();
