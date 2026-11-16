// Dashboard quản trị: Tổng quan · Hồ sơ & xếp lớp · Lớp học & lịch · Phê duyệt sĩ số · Console tư vấn
(function () {
  const { esc, money, moneyShort, date, dateTime, time, L, badge, schedule, meter, toast, modal, errorList } = window.UI;
  const $ = (s, el = document) => el.querySelector(s);
  const S = { token: localStorage.getItem('staff.token'), user: JSON.parse(localStorage.getItem('staff.user') || 'null'), charts: [], socket: null, chatSel: null, chatTab: 'OPEN', regTab: 'TESTED', clsTab: 'RECRUITING', sessions: [] };
  const isOffice = () => ['ACADEMIC', 'DIRECTOR'].includes(S.user?.role);
  const isDirector = () => S.user?.role === 'DIRECTOR';

  async function api(method, url, body) {
    try { return await window.UI.api(method, url, body, S.token); } catch (e) {
      if (e.status === 401) { logout(); toast('Phiên đăng nhập hết hạn', 'Vui lòng đăng nhập lại.', 'warn'); }
      throw e;
    }
  }

  // ------------------------------------------------------------ đăng nhập
  const loginForm = $('#login-form');
  loginForm.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { loginForm.username.value = b.dataset.u; loginForm.password.value = '123456'; });
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await window.UI.api('POST', '/api/auth/login', { username: loginForm.username.value, password: loginForm.password.value });
      S.token = r.token; S.user = r.user;
      localStorage.setItem('staff.token', r.token); localStorage.setItem('staff.user', JSON.stringify(r.user));
      boot();
    } catch (err) { $('#lg-err').textContent = err.message; }
  };
  function logout() {
    localStorage.removeItem('staff.token'); localStorage.removeItem('staff.user');
    S.token = null; S.user = null;
    if (S.socket) S.socket.disconnect();
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  }
  $('#logout').onclick = logout;
  $('#burger').onclick = () => $('#side').classList.toggle('open');

  function boot() {
    if (!S.token) { $('#login').classList.remove('hidden'); return; }
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    $('#me-name').textContent = S.user.full_name;
    $('#me-role').textContent = L.role[S.user.role];
    $('#me-av').textContent = S.user.full_name.split(' ').slice(-2).map((w) => w[0]).join('');
    connectSocket();
    refreshBadges();
    if (!location.hash) location.hash = S.user.role === 'CONSULTANT' ? '#chat' : '#dashboard';
    route();
  }

  function connectSocket() {
    if (S.socket) S.socket.disconnect();
    S.socket = io({ auth: { token: S.token }, transports: ['websocket', 'polling'] });
    S.socket.on('connect', () => $('#live').classList.add('on'));
    S.socket.on('disconnect', () => $('#live').classList.remove('on'));
    S.socket.on('queue:update', (sessions) => {
      S.sessions = sessions;
      setCnt('#cnt-chat', sessions.filter((s) => s.status === 'WAITING').length);
      if (currentView() === 'chat') renderQueue();
    });
    S.socket.on('chat:message', (m) => { if (currentView() === 'chat' && S.chatSel === m.session_id) appendMsg(m); });
    S.socket.on('chat:typing', ({ from, typing }) => { const t = $('#conv-typing'); if (t && from === 'STUDENT') t.classList.toggle('hidden', !typing); });
  }
  const setCnt = (sel, n) => { $(sel).textContent = n ? n : ''; };
  async function refreshBadges() {
    try {
      const d = await api('GET', '/api/admin/dashboard');
      setCnt('#cnt-place', d.kpis.toPlace); setCnt('#cnt-approve', d.kpis.pendingApprovals); setCnt('#cnt-chat', d.kpis.waitingChats);
      return d;
    } catch { return null; }
  }

  // ------------------------------------------------------------ router
  const VIEWS = {
    dashboard: ['Tổng quan', 'Số liệu tuyển sinh, doanh thu và tình trạng sĩ số lớp', renderDashboard],
    registrations: ['Hồ sơ đăng ký & xếp lớp', 'Kết quả kiểm tra đầu vào được chuyển về văn phòng để xếp lớp', renderRegistrations],
    classes: ['Lớp học, lịch học & phòng học', 'Lập lịch, phân phòng, mở lớp theo quy tắc sĩ số', renderClasses],
    approvals: ['Phê duyệt vượt sĩ số', 'Lớp Offline vượt 30 học viên – quyết định thuộc Lãnh đạo trung tâm', renderApprovals],
    chat: ['Tư vấn trực tuyến', 'Phòng chat thời gian thực với học viên', renderChat],
  };
  const currentView = () => (location.hash || '#dashboard').slice(1);
  window.addEventListener('hashchange', route);
  window.addEventListener('themechange', () => { if (currentView() === 'dashboard') route(); });
  function route() {
    if (!S.token) return;
    const v = VIEWS[currentView()] ? currentView() : 'dashboard';
    document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    $('#side').classList.remove('open');
    $('#view-title').textContent = VIEWS[v][0];
    $('#view-sub').textContent = VIEWS[v][1];
    S.charts.forEach((c) => c.destroy()); S.charts = [];
    $('#view').innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:320px"></div>';
    VIEWS[v][2]().catch((e) => { $('#view').innerHTML = `<div class="alert alert-red">${esc(e.message)}</div>`; });
  }

  // ------------------------------------------------------------ TỔNG QUAN
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const PALETTE = ['#b3261e', '#1f4e8c', '#1e7b45', '#5b3fb3', '#c9a227'];

  async function renderDashboard() {
    const d = await refreshBadges();
    if (!d) throw new Error('Không tải được số liệu.');
    const k = d.kpis;
    const delta = k.revenuePrevMonth ? Math.round(((k.revenueMonth - k.revenuePrevMonth) / k.revenuePrevMonth) * 100) : null;
    const tile = (lbl, val, sub, ico, bg, href) => `<div class="card kpi ${href ? 'link' : ''}" ${href ? `onclick="location.hash='${href}'"` : ''}>
      <div class="ico" style="background:${bg}">${ico}</div><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
    const states = ['BELOW_MIN', 'ELIGIBLE', 'FULL', 'PENDING_APPROVAL', 'OVER_CAPACITY'];
    const capSorted = [...d.classCapacity].sort((a, b) => states.indexOf(b.state) - states.indexOf(a.state) || a.start_date.localeCompare(b.start_date));
    const top = d.funnel[0].value || 1;
    $('#view').innerHTML = `
      <div class="kpis">
        ${tile('Doanh thu tháng này', moneyShort(k.revenueMonth), delta === null ? '—' : `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span> so với tháng trước`, '₫', 'var(--red-50)')}
        ${tile('Tổng doanh thu', moneyShort(k.revenueTotal), `${k.registrations} hồ sơ hiệu lực`, '∑', 'var(--blue-50)')}
        ${tile('Đăng ký mới (tháng)', k.registrationsMonth, `${k.pendingPayment} hồ sơ chờ nộp phí`, '✎', 'var(--violet-50)', '#registrations')}
        ${tile('Chờ xếp lớp', k.toPlace, 'Đã có kết quả đầu vào', '⇄', 'var(--amber-50)', '#registrations')}
        ${tile('Lớp đang tuyển sinh', k.recruitingClasses, `${k.readyToOpen} lớp đủ điều kiện mở · ${k.inProgressClasses} lớp đang học`, '▣', 'var(--green-50)', '#classes')}
        ${tile('Tờ trình chờ duyệt', k.pendingApprovals, `${k.waitingChats} phiên chat đang chờ`, '!', 'var(--red-50)', '#approvals')}
      </div>
      <div class="dash-grid">
        <div class="card span-8"><div class="card-head"><h3>Doanh thu & đăng ký 6 tháng gần nhất</h3></div><div class="chart-box"><canvas id="ch-rev"></canvas></div></div>
        <div class="card span-4"><div class="card-head"><h3>Phễu tuyển sinh</h3></div>
          <div class="funnel">${d.funnel.map((f) => `<div class="fr"><span>${f.label}</span><div class="bar"><i style="width:${(f.value / top) * 100}%"></i></div><span class="num">${f.value}</span></div>`).join('')}
          <p class="tiny" style="margin:4px 0 0">Tỉ lệ chuyển đổi đăng ký → xếp lớp: <b>${Math.round((d.funnel[3].value / top) * 100)}%</b></p></div></div>
        <div class="card span-7"><div class="card-head"><h3>Sĩ số lớp đang tuyển sinh</h3><div class="spacer"></div><a class="small" href="#classes">Quản lý lớp →</a></div>
          <div class="legend"><span style="--c:var(--amber)">Chưa đủ ngưỡng mở</span><span style="--c:var(--green)">Đủ điều kiện mở</span><span style="--c:var(--blue)">Đủ 30 (offline)</span><span style="--c:var(--red)">Chờ duyệt vượt sĩ số</span><span style="--c:var(--text)">│ vạch ngưỡng mở lớp (10 / 20)</span></div>
          <div class="cap-list">${capSorted.map((c) => `<div class="cap-row" data-cls="${c.class_id}"><div><span class="mono">${esc(c.code)}</span><div class="tiny">${L.form[c.form]} · KG ${date(c.start_date)}</div></div>
            <div>${meter({ enrolled: c.enrolled, waiting: c.waiting, min: c.min, max: c.max, capacityState: c.state })}<div class="cap-line"><span>${c.enrolled}${c.waiting ? ` + ${c.waiting} chờ` : ''} / ${c.max}</span><span>mở từ ${c.min}</span></div></div>
            <div>${badge(L.cap[c.state])}</div></div>`).join('')}</div></div>
        <div class="card span-5"><div class="card-head"><h3>Đăng ký theo chứng chỉ</h3></div><div class="chart-box sm"><canvas id="ch-cert"></canvas></div></div>
        <div class="card span-5"><div class="card-head"><h3>Trình độ đầu vào (CEFR)</h3></div><div class="chart-box sm"><canvas id="ch-level"></canvas></div></div>
        <div class="card span-7"><div class="card-head"><h3>Hồ sơ mới nhất</h3><div class="spacer"></div><a class="small" href="#registrations">Tất cả →</a></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>Mã hồ sơ</th><th>Học viên</th><th>Khoá học</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>
          ${d.recentRegistrations.map((r) => `<tr><td class="mono">${esc(r.reg_code)}</td><td>${esc(r.full_name)}</td><td>${esc(r.course_name)}</td><td>${badge(L.reg[r.status])}</td><td class="small muted">${dateTime(r.created_at)}</td></tr>`).join('')}
          </tbody></table></div></div>
      </div>`;
    $('#view').querySelectorAll('.cap-row').forEach((r) => r.onclick = () => openClass(Number(r.dataset.cls)));

    Chart.defaults.font.family = css('--font');
    Chart.defaults.color = css('--text-2');
    Chart.defaults.borderColor = css('--border');
    const monthLabels = d.months.map((m) => `T${Number(m.slice(5))}/${m.slice(2, 4)}`);
    S.charts.push(new Chart($('#ch-rev'), {
      data: {
        labels: monthLabels,
        datasets: [
          { type: 'bar', label: 'Doanh thu (triệu đ)', data: d.revenueByMonth.map((v) => +(v / 1e6).toFixed(1)), backgroundColor: '#b3261e', borderRadius: 6, yAxisID: 'y', maxBarThickness: 46 },
          { type: 'line', label: 'Hồ sơ đăng ký', data: d.registrationsByMonth, borderColor: '#1f4e8c', backgroundColor: '#1f4e8c', tension: .35, pointRadius: 4, borderWidth: 2.5, yAxisID: 'y1' },
        ],
      },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => c.datasetIndex === 0 ? ` Doanh thu: ${money(c.raw * 1e6)}` : ` Đăng ký: ${c.raw} hồ sơ` } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'triệu đồng' }, grid: { color: css('--border') } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, title: { display: true, text: 'hồ sơ' } }, x: { grid: { display: false } } },
      },
    }));
    S.charts.push(new Chart($('#ch-cert'), {
      type: 'doughnut',
      data: { labels: d.byCertificate.map((c) => c.certificate === 'CAMBRIDGE' ? 'Cambridge' : c.certificate), datasets: [{ data: d.byCertificate.map((c) => c.registrations), backgroundColor: PALETTE, borderColor: css('--surface'), borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw} hồ sơ · ${moneyShort(d.byCertificate[c.dataIndex].revenue)}` } } } },
    }));
    S.charts.push(new Chart($('#ch-level'), {
      type: 'bar',
      data: { labels: d.levels.map((l) => l.level), datasets: [{ label: 'Học viên', data: d.levels.map((l) => l.n), backgroundColor: '#1f4e8c', borderRadius: 6, maxBarThickness: 48 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } },
    }));
  }

  // ------------------------------------------------------------ HỒ SƠ & XẾP LỚP
  async function renderRegistrations() {
    const all = await api('GET', '/api/admin/registrations');
    const tabs = [['TESTED', 'Chờ xếp lớp'], ['WAITING_APPROVAL', 'Chờ duyệt sĩ số'], ['PAID', 'Chờ thi'], ['PENDING_PAYMENT', 'Chờ nộp phí'], ['ENROLLED', 'Đã xếp lớp'], ['CANCELLED', 'Đã huỷ'], ['', 'Tất cả']];
    const count = (s) => all.filter((r) => !s || r.status === s).length;
    $('#view').innerHTML = `<div class="card">
      <div class="card-head" style="flex-wrap:wrap"><div class="tabs" id="rg-tabs" style="border:0">${tabs.map(([s, l]) => `<button data-s="${s}" class="${s === S.regTab ? 'on' : ''}">${l}<span class="n">${count(s)}</span></button>`).join('')}</div>
        <div class="spacer"></div><input class="input" id="rg-q" placeholder="Tìm mã hồ sơ, tên, SĐT…" style="max-width:260px"></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Mã hồ sơ</th><th>Học viên</th><th>Khoá học</th><th>Mong muốn</th><th>Đầu vào</th><th>Lớp</th><th>Trạng thái</th><th>Cập nhật</th><th></th></tr></thead><tbody id="rg-body"></tbody></table></div></div>`;
    const draw = () => {
      const q = $('#rg-q').value.trim().toLowerCase();
      const rows = all.filter((r) => (!S.regTab || r.status === S.regTab) && (!q || `${r.reg_code} ${r.full_name} ${r.phone} ${r.email}`.toLowerCase().includes(q)));
      $('#rg-body').innerHTML = rows.length ? rows.slice(0, 200).map((r) => `<tr>
        <td class="mono">${esc(r.reg_code)}</td><td><b>${esc(r.full_name)}</b><div class="tiny">${esc(r.phone)}</div></td><td>${esc(r.course_name)}</td>
        <td class="small">${L.form[r.desired_form]} · ${L.shift[r.desired_shift]}${r.desired_class_code ? `<div class="tiny mono">${esc(r.desired_class_code)}</div>` : ''}</td>
        <td>${r.assessed_level ? `<span class="badge b-gold plain">${r.assessed_level}</span> <span class="tiny">${r.score}/${r.total}</span>` : '<span class="tiny">—</span>'}</td>
        <td class="mono small">${r.class_code ? esc(r.class_code) : '—'}</td>
        <td>${badge(L.reg[r.status])}${r.placement_note ? `<div class="tiny" title="${esc(r.placement_note)}">⚠ xếp lệch trình độ</div>` : ''}</td><td class="small muted">${dateTime(r.updated_at)}</td>
        <td>${r.status === 'TESTED' && isOffice() ? `<button class="btn btn-primary btn-sm" data-enroll="${r.registration_id}">Xếp lớp</button>` : ''}
            ${r.status === 'PENDING_PAYMENT' && isOffice() ? `<button class="btn btn-outline btn-sm" data-cash="${r.registration_id}">Thu tiền mặt</button> <button class="btn btn-ghost btn-sm" data-cancel="${r.registration_id}">Huỷ</button>` : ''}
            ${r.status === 'WAITING_APPROVAL' ? '<a class="btn btn-ghost btn-sm" href="#approvals">Xem tờ trình</a>' : ''}</td></tr>`).join('')
        : '<tr><td colspan="9"><div class="empty"><div class="ico">📭</div>Không có hồ sơ</div></td></tr>';
    };
    $('#rg-tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.regTab = b.dataset.s; $('#rg-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    $('#rg-q').oninput = draw;
    $('#rg-body').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.enroll) openEnroll(all.find((r) => r.registration_id === Number(t.dataset.enroll)));
      if (t.dataset.cash) {
        const r = all.find((x) => x.registration_id === Number(t.dataset.cash));
        if (!confirm(`Xác nhận đã thu ${money(r.tuition_fee)} tiền mặt của ${r.full_name}?`)) return;
        try { await api('POST', `/api/admin/registrations/${r.registration_id}/cash-payment`); toast('Đã ghi nhận thu học phí', `${esc(r.reg_code)} chuyển sang "Đã nộp – chờ thi"`, 'ok'); route(); } catch (err) { toast('Lỗi', esc(err.message), 'bad'); }
      }
      if (t.dataset.cancel) {
        if (!confirm('Huỷ hồ sơ chưa nộp học phí này?')) return;
        try { await api('POST', `/api/admin/registrations/${t.dataset.cancel}/cancel`); toast('Đã huỷ hồ sơ', '', 'ok'); route(); } catch (err) { toast('Lỗi', esc(err.message), 'bad'); }
      }
    };
    draw();
  }

  async function openEnroll(reg) {
    const s = await api('GET', `/api/admin/registrations/${reg.registration_id}/suggestions`);
    const m = modal({
      title: `Xếp lớp · <span class="mono">${esc(reg.reg_code)}</span>`, drawer: true,
      body: `<dl class="kv"><dt>Học viên</dt><dd>${esc(reg.full_name)}</dd><dt>Khoá đã nộp phí</dt><dd>${esc(reg.course_name)}</dd>
          <dt>Trình độ đầu vào</dt><dd><span class="badge b-gold plain">${s.level}</span> (${reg.score}/${reg.total} câu)</dd>
          <dt>Mong muốn</dt><dd>${L.form[reg.desired_form]} · ca ${L.shift[reg.desired_shift]}${reg.desired_class_code ? ` · lớp ${esc(reg.desired_class_code)}` : ''}</dd></dl>
        <div class="alert alert-blue" style="margin:16px 0">Gợi ý xếp hạng theo BR-06: đúng trình độ › lớp mong muốn › hình thức › ca học › còn chỗ. Lớp Offline đã đủ 30 sẽ tự động lập tờ trình gửi Lãnh đạo.</div>
        <div class="grid" style="gap:10px">${s.classes.length ? s.classes.map((c, i) => `<div class="sugg ${i === 0 && c.levelMatch ? 'best' : ''}">
          <div><h4><span class="mono">${esc(c.code)}</span> ${i === 0 && c.levelMatch ? '<span class="badge b-green plain">Phù hợp nhất</span>' : ''}</h4>
            <div class="row small" style="gap:6px"><span class="badge ${c.form === 'ONLINE' ? 'b-blue' : 'b-red'} plain">${L.form[c.form]}</span><span class="badge ${c.levelMatch ? 'b-gold' : 'b-amber'} plain">Trình độ ${c.level}${c.levelMatch ? '' : ' (lệch)'}</span>${badge(L.classStatus[c.status])}${c.status === 'RECRUITING' ? badge(L.cap[c.capacity.capacityState]) : ''}</div>
            <div class="small muted" style="margin-top:6px">${schedule(c.slots)} · KG ${date(c.start_date)} · ${c.room_name ? esc(c.room_name) : (c.form === 'ONLINE' ? 'Online' : 'chưa có phòng')}</div>
            <div style="max-width:300px;margin-top:8px">${meter(c.capacity)}<div class="cap-line"><span>${c.enrolled}${c.waiting ? ` + ${c.waiting} chờ` : ''}/${c.capacity.max}</span><span>mở từ ${c.capacity.min}</span></div></div>
            ${c.levelMatch ? '' : `<input class="input" style="margin-top:8px" placeholder="Lý do xếp lệch trình độ (bắt buộc)" data-reason="${c.class_id}">`}</div>
          <button class="btn ${c.form === 'OFFLINE' && c.enrolled >= 30 ? 'btn-outline' : 'btn-primary'} btn-sm" data-pick="${c.class_id}">${c.form === 'OFFLINE' && c.enrolled >= 30 ? 'Lập tờ trình' : 'Xếp vào lớp'}</button></div>`).join('')
        : '<div class="empty">Khoá học chưa có lớp đang mở. Hãy tạo lớp mới ở mục "Lớp học & lịch".</div>'}</div>`,
    });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const reasonEl = m.el.querySelector(`[data-reason="${b.dataset.pick}"]`);
      b.disabled = true;
      try {
        const r = await api('POST', `/api/admin/registrations/${reg.registration_id}/enroll`, { class_id: Number(b.dataset.pick), reason: reasonEl ? reasonEl.value : undefined });
        toast(r.result === 'ENROLLED' ? 'Xếp lớp thành công' : 'Đã lập tờ trình gửi Lãnh đạo', esc(r.message), r.result === 'ENROLLED' ? 'ok' : 'warn');
        m.close(); refreshBadges(); route();
      } catch (err) { toast('Không xếp được lớp', errorList(err), 'bad'); b.disabled = false; reasonEl?.focus(); }
    });
  }

  // ------------------------------------------------------------ LỚP HỌC
  async function renderClasses() {
    const all = await api('GET', '/api/admin/classes');
    const tabs = [['RECRUITING', 'Đang tuyển sinh'], ['IN_PROGRESS', 'Đang học'], ['COMPLETED', 'Đã kết thúc'], ['CANCELLED', 'Đã huỷ'], ['', 'Tất cả']];
    $('#view').innerHTML = `<div class="card">
      <div class="card-head" style="flex-wrap:wrap"><div class="tabs" id="cl-tabs" style="border:0">${tabs.map(([s, l]) => `<button data-s="${s}" class="${s === S.clsTab ? 'on' : ''}">${l}<span class="n">${all.filter((c) => !s || c.status === s).length}</span></button>`).join('')}</div>
        <div class="spacer"></div>${isOffice() ? '<button class="btn btn-primary btn-sm" id="cl-new">＋ Tạo lớp mới</button>' : ''}</div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Mã lớp</th><th>Khoá học</th><th>Hình thức</th><th>Lịch học</th><th>Giảng viên / Phòng</th><th>Khai giảng</th><th style="min-width:170px">Sĩ số</th><th>Tình trạng</th></tr></thead><tbody id="cl-body"></tbody></table></div></div>`;
    const draw = () => {
      const rows = all.filter((c) => !S.clsTab || c.status === S.clsTab);
      $('#cl-body').innerHTML = rows.map((c) => `<tr data-id="${c.class_id}" style="cursor:pointer">
        <td><b class="mono">${esc(c.code)}</b>${c.parent_class_id ? '<div class="tiny">tách từ lớp khác</div>' : ''}</td><td>${esc(c.course_name)}<div class="tiny">Trình độ ${c.level}</div></td>
        <td><span class="badge ${c.form === 'ONLINE' ? 'b-blue' : 'b-red'} plain">${L.form[c.form]}</span></td><td class="small">${schedule(c.slots)}</td>
        <td class="small">${esc(c.teacher_name)}<div class="tiny">${c.form === 'ONLINE' ? 'Phòng học trực tuyến' : c.room_name ? `${esc(c.room_name)} (${c.room_capacity} chỗ)` : '<span style="color:var(--red)">Chưa phân phòng</span>'}</div></td>
        <td class="small">${date(c.start_date)}</td>
        <td>${meter(c.capacity)}<div class="cap-line"><span>${c.enrolled}${c.waiting ? ` + ${c.waiting} chờ` : ''}/${c.capacity.max}</span><span>mở từ ${c.capacity.min}</span></div></td>
        <td>${badge(L.classStatus[c.status])}${c.status === 'RECRUITING' ? `<div style="margin-top:4px">${badge(L.cap[c.capacity.capacityState])}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Không có lớp</div></td></tr>';
    };
    $('#cl-tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.clsTab = b.dataset.s; $('#cl-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    $('#cl-body').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openClass(Number(tr.dataset.id)); };
    const nb = $('#cl-new'); if (nb) nb.onclick = openNewClass;
    draw();
  }

  let refs = null;
  async function loadRefs() {
    if (!refs) {
      const [rooms, teachers, courses] = await Promise.all([api('GET', '/api/admin/rooms'), api('GET', '/api/admin/teachers'), api('GET', '/api/admin/courses')]);
      refs = { rooms, teachers, courses };
    }
    return refs;
  }
  const slotGrid = (slots = []) => {
    const has = (w, s) => slots.some((x) => x.weekday === w && x.shift === s);
    return `<div class="slot-grid"><div></div>${[2, 3, 4, 5, 6, 7, 8].map((w) => `<div class="h">${L.wd[w]}</div>`).join('')}
      ${['MORNING', 'AFTERNOON', 'EVENING'].map((s) => `<div class="h" style="text-align:left">${L.shift[s]}</div>${[2, 3, 4, 5, 6, 7, 8].map((w) => `<label title="${L.wd[w]} ${L.shift[s]} ${L.shiftTime[s]}"><input type="checkbox" name="slot" value="${w}|${s}" ${has(w, s) ? 'checked' : ''}></label>`).join('')}`).join('')}</div>`;
  };
  const readSlots = (root) => [...root.querySelectorAll('[name=slot]:checked')].map((i) => { const [w, s] = i.value.split('|'); return { weekday: Number(w), shift: s }; });

  async function openClass(id) {
    const [c, r] = await Promise.all([api('GET', `/api/admin/classes/${id}`), loadRefs()]);
    const editable = isOffice() && ['RECRUITING', 'IN_PROGRESS'].includes(c.status);
    const m = modal({
      title: `Lớp <span class="mono">${esc(c.code)}</span> ${badge(L.classStatus[c.status])}`, drawer: true,
      body: `<dl class="kv"><dt>Khoá học</dt><dd>${esc(c.course_name)} · trình độ ${c.level}</dd><dt>Hình thức</dt><dd>${L.form[c.form]}${c.meeting_link ? ` · <span class="small mono">${esc(c.meeting_link)}</span>` : ''}</dd>
          <dt>Thời gian</dt><dd>${date(c.start_date)} → ${date(c.end_date)}</dd><dt>Lịch học</dt><dd>${schedule(c.slots)}</dd>
          <dt>Sĩ số</dt><dd><div style="max-width:320px">${meter(c.capacity)}<div class="cap-line"><span>${c.enrolled} học viên${c.waiting ? ` + ${c.waiting} chờ duyệt` : ''} / tối đa ${c.capacity.max}</span><span>mở từ ${c.capacity.min}</span></div></div></dd></dl>
        ${c.status === 'RECRUITING' ? `<div class="alert ${c.openCheck.ok ? 'alert-green' : 'alert-amber'}" style="margin:16px 0"><b>${c.openCheck.ok ? '✓ Lớp đủ điều kiện mở (BR-08)' : 'Chưa đủ điều kiện mở lớp:'}</b>${c.openCheck.ok ? '' : `<ul>${c.openCheck.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`}</div>` : ''}
        ${editable ? `<div class="card card-pad" style="margin:14px 0"><h4>Lập lịch · phân phòng · giảng viên</h4>
          <div class="form-grid" style="margin-bottom:12px">
            <div class="field"><label>Giảng viên</label><select class="input" id="ar-teacher">${r.teachers.map((t) => `<option value="${t.teacher_id}" ${t.teacher_id === c.teacher_id ? 'selected' : ''}>${esc(t.full_name)} – ${esc(t.specialty)}</option>`).join('')}</select></div>
            <div class="field"><label>Phòng học ${c.form === 'ONLINE' ? '(không áp dụng)' : ''}</label><select class="input" id="ar-room" ${c.form === 'ONLINE' ? 'disabled' : ''}><option value="">— Chưa phân phòng —</option>${r.rooms.map((x) => `<option value="${x.room_id}" ${x.room_id === c.room_id ? 'selected' : ''}>${esc(x.name)} · ${x.capacity} chỗ · ${esc(x.campus)}</option>`).join('')}</select></div>
          </div>${slotGrid(c.slots)}
          <div class="row" style="margin-top:12px"><button class="btn btn-navy btn-sm" id="ar-save">Lưu lịch & phòng</button><span class="tiny">Hệ thống kiểm tra trùng phòng/giảng viên và sức chứa phòng (BR-05).</span></div></div>` : ''}
        <h4 style="margin-top:16px">Danh sách học viên (${c.students.length})</h4>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Mã hồ sơ</th><th>Họ tên</th><th>Đầu vào</th><th>Trạng thái</th></tr></thead><tbody>
        ${c.students.map((s, i) => `<tr><td class="tiny">${i + 1}</td><td class="mono small">${esc(s.reg_code)}</td><td>${esc(s.full_name)}${s.placement_note ? `<div class="tiny">⚠ ${esc(s.placement_note)}</div>` : ''}</td><td>${s.assessed_level ? `<span class="badge b-gold plain">${s.assessed_level}</span>` : '—'}</td><td>${badge(L.reg[s.status])}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Chưa có học viên</div></td></tr>'}
        </tbody></table></div>`,
      foot: isOffice() ? `${c.status === 'RECRUITING' ? '<button class="btn btn-ghost" id="cl-cancel">Huỷ lớp</button><div class="spacer"></div><button class="btn btn-success" id="cl-open">Mở lớp</button>' : ''}${c.status === 'IN_PROGRESS' ? '<button class="btn btn-outline" id="cl-done">Kết thúc khoá</button>' : ''}` : '',
    });
    const act = async (fn, okMsg) => { try { await fn(); toast(okMsg, '', 'ok'); m.close(); route(); refreshBadges(); } catch (err) { toast('Không thực hiện được', errorList(err), 'bad'); } };
    const save = m.el.querySelector('#ar-save');
    if (save) save.onclick = () => act(() => api('PUT', `/api/admin/classes/${id}/arrangement`, { teacher_id: Number(m.el.querySelector('#ar-teacher').value), room_id: m.el.querySelector('#ar-room').value ? Number(m.el.querySelector('#ar-room').value) : null, slots: readSlots(m.el) }), 'Đã cập nhật lịch học & phòng');
    const op = m.el.querySelector('#cl-open'); if (op) op.onclick = () => act(() => api('POST', `/api/admin/classes/${id}/open`), `Đã mở lớp ${c.code}`);
    const ca = m.el.querySelector('#cl-cancel'); if (ca) ca.onclick = () => confirm(`Huỷ lớp ${c.code}? ${c.enrolled} học viên sẽ trở về danh sách chờ xếp lớp.`) && act(() => api('POST', `/api/admin/classes/${id}/cancel`, { note: 'Huỷ bởi giáo vụ' }), `Đã huỷ lớp ${c.code}`);
    const dn = m.el.querySelector('#cl-done'); if (dn) dn.onclick = () => confirm('Xác nhận kết thúc khoá học?') && act(() => api('POST', `/api/admin/classes/${id}/complete`), 'Đã kết thúc khoá học');
  }

  async function openNewClass() {
    const r = await loadRefs();
    const m = modal({
      title: 'Tạo lớp mới', wide: true,
      body: `<form id="nc" class="form-grid">
        <div class="field"><label>Khoá học</label><select class="input" name="course_id">${r.courses.map((c) => `<option value="${c.course_id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Trình độ lớp</label><select class="input" name="level"><option>A2</option><option selected>B1</option><option>B2</option><option>C1</option></select></div>
        <div class="field"><label>Hình thức</label><select class="input" name="form"><option value="OFFLINE">Offline (20 – 30 học viên)</option><option value="ONLINE">Online (từ 10 học viên)</option></select></div>
        <div class="field"><label>Giảng viên</label><select class="input" name="teacher_id">${r.teachers.map((t) => `<option value="${t.teacher_id}">${esc(t.full_name)}</option>`).join('')}</select></div>
        <div class="field"><label>Khai giảng</label><input class="input" type="date" name="start_date" required></div>
        <div class="field"><label>Kết thúc</label><input class="input" type="date" name="end_date" required></div>
        <div class="field full"><label>Phòng học (lớp Offline, có thể phân sau)</label><select class="input" name="room_id"><option value="">— Phân phòng sau —</option>${r.rooms.map((x) => `<option value="${x.room_id}">${esc(x.name)} · ${x.capacity} chỗ · ${esc(x.campus)}</option>`).join('')}</select></div>
        <div class="field full"><label>Lịch học trong tuần</label>${slotGrid([])}</div></form>`,
      foot: '<button class="btn btn-ghost" data-x>Huỷ</button><button class="btn btn-primary" data-ok>Tạo lớp</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = async () => {
      const f = m.el.querySelector('#nc');
      const dto = Object.fromEntries(new FormData(f).entries());
      try {
        const c = await api('POST', '/api/admin/classes', { ...dto, course_id: Number(dto.course_id), teacher_id: Number(dto.teacher_id), room_id: dto.room_id ? Number(dto.room_id) : null, slots: readSlots(f) });
        toast('Đã tạo lớp', esc(c.code), 'ok'); m.close(); S.clsTab = 'RECRUITING'; route();
      } catch (err) { toast('Không tạo được lớp', errorList(err), 'bad'); }
    };
  }

  // ------------------------------------------------------------ PHÊ DUYỆT
  async function renderApprovals() {
    const [pending, done] = await Promise.all([api('GET', '/api/admin/approvals?status=PENDING'), api('GET', '/api/admin/approvals')]);
    const history = done.filter((x) => x.status !== 'PENDING');
    const optLabel = { SPLIT: 'Tách lớp', KEEP: 'Giữ ngoại lệ', REJECT: 'Từ chối' };
    $('#view').innerHTML = `
      ${isDirector() ? '' : '<div class="alert alert-amber">Bạn đang xem với vai trò <b>' + L.role[S.user.role] + '</b>. Chỉ <b>Lãnh đạo trung tâm</b> có quyền ra quyết định (đăng nhập tài khoản <span class="mono">lanhdao</span>).</div>'}
      ${pending.length ? pending.map((a) => `<div class="card appr" data-id="${a.request_id}">
        <div class="appr-top"><div><div class="row"><h3 style="margin:0">Tờ trình #${a.request_id} · lớp <span class="mono">${esc(a.class_code)}</span></h3>${badge(['Chờ quyết định', 'b-red'])}</div>
            <p class="muted small" style="margin:6px 0 0">${esc(a.course_name)} · ${L.form[a.form]} · trình độ ${a.level} · ${a.room_name ? `${esc(a.room_name)} (${a.room_capacity} chỗ)` : 'chưa có phòng'} · lập ${dateTime(a.created_at)}</p>
            <p style="margin:10px 0 0">${esc(a.reason)}</p>
            <div class="nums"><div><b>${a.enrolled}</b><span>đã xếp lớp</span></div><div><b style="color:var(--red)">${a.waiting}</b><span>hồ sơ chờ duyệt</span></div><div><b>${a.proposal.total}</b><span>tổng nếu giữ</span></div></div></div>
          <div><div class="tiny" style="margin-bottom:6px">Hồ sơ đang chờ:</div><div class="small" style="max-height:150px;overflow:auto">${a.waiting_students.map((s) => `<div><span class="mono">${esc(s.reg_code)}</span> · ${esc(s.full_name)}</div>`).join('')}</div></div></div>
        <div class="options">${['SPLIT', 'KEEP', 'REJECT'].map((k) => { const o = a.proposal.options[k]; return `<label class="opt ${o.feasible ? '' : 'disabled'}">${a.proposal.recommended === k ? '<span class="rec">ĐỀ XUẤT</span>' : ''}
            <input type="radio" name="d-${a.request_id}" value="${k}" ${a.proposal.recommended === k ? 'checked' : ''} ${o.feasible && isDirector() ? '' : 'disabled'}><b>${optLabel[k]}${k === 'SPLIT' ? (o.mode === 'EVEN' ? ' – chia đều' : ' – tách phần dư') : ''}</b>${esc(o.note)}</label>`; }).join('')}</div>
        <div class="appr-foot"><input class="input" placeholder="Ghi chú quyết định của Lãnh đạo…" data-note ${isDirector() ? '' : 'disabled'}><button class="btn btn-primary" data-decide ${isDirector() ? '' : 'disabled'}>Ra quyết định</button></div></div>`).join('')
        : '<div class="card empty"><div class="ico">✅</div><b>Không có tờ trình nào đang chờ</b><p class="small">Tờ trình được lập tự động khi giáo vụ xếp học viên vào lớp Offline đã đủ 30.</p></div>'}
      <div class="card"><div class="card-head"><h3>Lịch sử quyết định</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Lớp</th><th>Nội dung</th><th>Quyết định</th><th>Ghi chú</th><th>Người duyệt</th><th>Thời gian</th></tr></thead><tbody>
        ${history.map((h) => `<tr><td>${h.request_id}</td><td class="mono">${esc(h.class_code)}</td><td class="small">${esc(h.reason)}</td><td>${badge([optLabel[h.decision], h.status === 'APPROVED' ? 'b-green' : 'b-gray'])}${h.result_class_code ? `<div class="tiny mono">→ ${esc(h.result_class_code)}</div>` : ''}</td><td class="small">${esc(h.decision_note || '—')}</td><td class="small">${esc(h.decided_by_name || '—')}</td><td class="small muted">${dateTime(h.decided_at)}</td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Chưa có</div></td></tr>'}
      </tbody></table></div></div>`;
    $('#view').querySelectorAll('[data-decide]').forEach((b) => b.onclick = async () => {
      const card = b.closest('.appr');
      const id = card.dataset.id;
      const decision = card.querySelector(`[name=d-${id}]:checked`)?.value;
      if (!decision) return toast('Chọn một phương án', '', 'warn');
      if (!confirm(`Xác nhận quyết định "${optLabel[decision]}" cho tờ trình #${id}?`)) return;
      b.disabled = true;
      try {
        const r = await api('POST', `/api/admin/approvals/${id}/decide`, { decision, note: card.querySelector('[data-note]').value });
        toast('Đã ra quyết định', esc(r.summary), 'ok'); refreshBadges(); route();
      } catch (err) { toast('Không thực hiện được', errorList(err), 'bad'); b.disabled = false; }
    });
  }

  // ------------------------------------------------------------ CONSOLE TƯ VẤN
  async function renderChat() {
    S.sessions = await api('GET', '/api/admin/chat/sessions');
    $('#view').innerHTML = `<div class="card chat-wrap">
      <div class="queue"><div class="tabs" id="q-tabs"><button data-t="OPEN" class="${S.chatTab === 'OPEN' ? 'on' : ''}">Đang mở</button><button data-t="CLOSED" class="${S.chatTab === 'CLOSED' ? 'on' : ''}">Đã kết thúc</button></div><div class="q-list" id="q-list"></div></div>
      <div class="conv" id="conv"><div class="empty" style="margin:auto"><div class="ico">💬</div>Chọn một phiên tư vấn ở bên trái</div></div></div>`;
    $('#q-tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.chatTab = b.dataset.t; $('#q-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderQueue(); };
    renderQueue();
    if (S.chatSel) openConv(S.chatSel);
  }

  function renderQueue() {
    const list = $('#q-list'); if (!list) return;
    const rows = S.sessions.filter((s) => (S.chatTab === 'OPEN' ? s.status !== 'CLOSED' : s.status === 'CLOSED'));
    const st = { WAITING: ['Đang chờ', 'b-red'], ACTIVE: ['Đang tư vấn', 'b-green'], CLOSED: ['Đã kết thúc', 'b-gray'] };
    list.innerHTML = rows.map((s) => `<div class="q-item ${s.session_id === S.chatSel ? 'sel' : ''}" data-id="${esc(s.session_id)}">
      <div class="t"><b>${esc(s.guest_name)}</b>${badge(st[s.status])}<div class="spacer"></div><span class="tiny">${dateTime(s.last_at || s.started_at)}</span></div>
      <div class="tiny">${esc(s.topic || '')}${s.consultant_name ? ` · ${esc(s.consultant_name)}` : ''}</div><div class="last">${esc(s.last_message || '')}</div></div>`).join('') || '<div class="empty small">Không có phiên nào</div>';
    list.onclick = (e) => { const it = e.target.closest('.q-item'); if (it) openConv(it.dataset.id); };
  }

  function appendMsg(m) {
    const box = $('#conv-msgs'); if (!box) return;
    const mine = m.sender_type === 'CONSULTANT';
    const el = document.createElement('div');
    el.className = `msg ${m.sender_type === 'SYSTEM' ? 'sys' : mine ? 'me' : 'them'}`;
    el.innerHTML = m.sender_type === 'SYSTEM' ? esc(m.body) : `${mine ? '' : `<b class="small">${esc(m.sender_name)}</b><br>`}${esc(m.body)}<small>${mine ? esc(m.sender_name) + ' · ' : ''}${time(m.sent_at)}</small>`;
    box.appendChild(el); box.scrollTop = box.scrollHeight;
  }

  async function openConv(id) {
    S.chatSel = id; renderQueue();
    const { session: s, messages } = await api('GET', `/api/admin/chat/sessions/${encodeURIComponent(id)}/messages`);
    const mine = s.consultant_id === S.user.id;
    const canClaim = s.status === 'WAITING' && ['CONSULTANT', 'DIRECTOR'].includes(S.user.role);
    $('#conv').innerHTML = `<div class="conv-head"><div class="avatar">${esc(s.guest_name.split(' ').slice(-1)[0][0])}</div>
        <div><b>${esc(s.guest_name)}</b><div class="tiny">${esc(s.guest_contact || 'Không để lại liên hệ')} · ${esc(s.topic || '')} · bắt đầu ${dateTime(s.started_at)}</div></div><div class="spacer"></div>
        ${canClaim ? '<button class="btn btn-primary btn-sm" id="cv-claim">Nhận phiên</button>' : ''}
        ${s.status === 'ACTIVE' && mine ? '<button class="btn btn-outline btn-sm" id="cv-close">Kết thúc</button>' : ''}
        ${s.status === 'ACTIVE' && !mine ? `<span class="tiny">Đang được ${esc(s.consultant_name)} tư vấn</span>` : ''}</div>
      <div class="conv-msgs" id="conv-msgs"></div><div class="typing hidden" id="conv-typing">Khách đang soạn tin…</div>
      ${s.status === 'ACTIVE' && mine ? '<form class="conv-input" id="cv-form"><input class="input" id="cv-text" placeholder="Nhập câu trả lời…" autocomplete="off" maxlength="2000"><button class="btn btn-navy">Gửi</button></form>' : ''}`;
    messages.forEach(appendMsg);
    // tham gia phòng socket để nhận tin realtime của phiên này
    if (s.status !== 'CLOSED') S.socket.emit('chat:resume', { sessionId: id }, () => {});
    const claim = $('#cv-claim');
    if (claim) claim.onclick = () => S.socket.emit('chat:claim', { sessionId: id }, (r) => { if (!r.ok) toast('Không nhận được phiên', esc(r.error), 'bad'); else openConv(id); });
    const close = $('#cv-close');
    if (close) close.onclick = () => confirm('Kết thúc phiên tư vấn?') && S.socket.emit('chat:close', { sessionId: id }, () => openConv(id));
    const form = $('#cv-form');
    if (form) {
      let tmr;
      $('#cv-text').focus();
      $('#cv-text').oninput = () => { S.socket.emit('chat:typing', { sessionId: id, typing: true }); clearTimeout(tmr); tmr = setTimeout(() => S.socket.emit('chat:typing', { sessionId: id, typing: false }), 1500); };
      form.onsubmit = (e) => {
        e.preventDefault();
        const body = $('#cv-text').value.trim(); if (!body) return;
        S.socket.emit('chat:message', { sessionId: id, body }, (r) => { if (!r.ok) toast('Không gửi được', esc(r.error), 'bad'); });
        S.socket.emit('chat:typing', { sessionId: id, typing: false });
        $('#cv-text').value = '';
      };
    }
  }

  boot();
})();
