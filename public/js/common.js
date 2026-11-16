// Tiện ích dùng chung cho Cổng học viên và Dashboard quản trị
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' đ';
  const moneyShort = (n) => n >= 1e9 ? (n / 1e9).toFixed(2).replace('.', ',') + ' tỷ' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' tr' : new Intl.NumberFormat('vi-VN').format(n);
  const date = (s) => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const p2 = (n) => String(n).padStart(2, '0');
  const dateTime = (s) => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const time = (s) => new Date(String(s).replace(' ', 'T')).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const L = {
    form: { ONLINE: 'Online', OFFLINE: 'Offline' },
    shift: { MORNING: 'Sáng', AFTERNOON: 'Chiều', EVENING: 'Tối' },
    shiftTime: { MORNING: '08:00–10:00', AFTERNOON: '14:00–16:00', EVENING: '18:30–20:30' },
    wd: { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' },
    classStatus: { RECRUITING: ['Đang tuyển sinh', 'b-blue'], IN_PROGRESS: ['Đang học', 'b-green'], COMPLETED: ['Đã kết thúc', 'b-gray'], CANCELLED: ['Đã huỷ', 'b-red'] },
    cap: {
      BELOW_MIN: ['Chưa đủ sĩ số', 'b-amber'], ELIGIBLE: ['Đủ điều kiện mở', 'b-green'], FULL: ['Đã đủ 30', 'b-blue'],
      OVER_CAPACITY: ['Vượt sĩ số (đã duyệt)', 'b-violet'], PENDING_APPROVAL: ['Chờ Lãnh đạo duyệt', 'b-red'],
    },
    reg: {
      PENDING_PAYMENT: ['Chờ nộp học phí', 'b-amber'], PAID: ['Đã nộp – chờ thi', 'b-blue'], TESTED: ['Đã thi – chờ xếp lớp', 'b-violet'],
      WAITING_APPROVAL: ['Chờ duyệt sĩ số', 'b-red'], ENROLLED: ['Đã xếp lớp', 'b-green'], CANCELLED: ['Đã huỷ', 'b-gray'],
    },
    pay: { VNPAY: 'VNPay', MOMO: 'Ví MoMo', BANK: 'Chuyển khoản', CASH: 'Tiền mặt' },
    role: { CONSULTANT: 'Tư vấn viên', ACADEMIC: 'Giáo vụ', DIRECTOR: 'Lãnh đạo trung tâm' },
    cert: { IELTS: 'b-red', TOEIC: 'b-blue', VSTEP: 'b-green', CAMBRIDGE: 'b-violet' },
  };
  const badge = (pair, extra = '') => pair ? `<span class="badge ${pair[1]} ${extra}">${esc(pair[0])}</span>` : '';
  const schedule = (slots) => {
    if (!slots || !slots.length) return 'Chưa xếp lịch';
    const byShift = {};
    slots.forEach((s) => (byShift[s.shift] ||= []).push(L.wd[s.weekday]));
    return Object.entries(byShift).map(([sh, days]) => `${days.join('-')} · ${L.shift[sh]} ${L.shiftTime[sh]}`).join(' / ');
  };
  const meter = (cap) => {
    const max = Math.max(cap.max, cap.enrolled + cap.waiting);
    const pct = Math.min(100, (cap.enrolled / max) * 100);
    const minPct = (cap.min / max) * 100;
    return `<div class="meter s-${cap.capacityState}" title="Sĩ số ${cap.enrolled}/${cap.max} · ngưỡng mở ${cap.min}"><i style="width:${pct}%"></i><b style="left:${minPct}%"></b></div>`;
  };

  async function api(method, url, body, token) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* không phải JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || `Lỗi ${res.status}`);
      err.status = res.status; err.code = data && data.error; err.details = data && data.details;
      throw err;
    }
    return data;
  }

  function toast(title, msg = '', kind = '') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<b>${esc(title)}</b>${msg ? `<div class="muted small">${msg}</div>` : ''}`;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, kind === 'bad' ? 6000 : 3800);
  }

  /** Mở modal; trả về { el, close }. */
  function modal({ title, body, foot = '', wide = false, drawer = false, onClose }) {
    const ov = document.createElement('div');
    ov.className = `overlay ${drawer ? 'drawer-overlay' : ''}`;
    ov.innerHTML = `<div class="${drawer ? 'drawer' : 'modal'} ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3><button class="x" aria-label="Đóng">✕</button></div>
      <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    ov.querySelector('.x').onclick = close;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    return { el: ov, close };
  }

  function errorList(err) {
    if (err.details && typeof err.details === 'object') {
      const items = Array.isArray(err.details) ? err.details.map((d) => typeof d === 'string' ? d : `Trùng ${d.type === 'ROOM' ? 'phòng' : 'giảng viên'} với lớp ${d.classCode} (${L.wd[d.weekday]} ${L.shift[d.shift]})`) : Object.values(err.details);
      return `${esc(err.message)}<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    }
    return esc(err.message);
  }

  // ---- Chế độ sáng / tối: mặc định theo hệ điều hành, bấm nút để ghi đè và lưu lại
  const darkNow = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const syncThemeButtons = () => document.querySelectorAll('[data-action="theme"]').forEach((b) => {
    b.textContent = darkNow() ? '☀️' : '🌙';
    b.title = darkNow() ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
  });
  function toggleTheme() {
    const next = darkNow() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* trình duyệt chặn lưu trữ */ }
    syncThemeButtons();
    window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="theme"]')) { e.preventDefault(); toggleTheme(); } });
  document.addEventListener('DOMContentLoaded', syncThemeButtons);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeButtons);

  window.UI = { esc, money, moneyShort, date, dateTime, time, L, badge, schedule, meter, api, toast, modal, errorList, toggleTheme };
})();
