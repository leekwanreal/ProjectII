// Cổng học viên: Quảng bá (CN1) · Tra cứu lớp (CN3) · Đăng ký (CN2) · Tra cứu hồ sơ – thanh toán – kiểm tra đầu vào
(function () {
  const { esc, money, date, L, badge, schedule, meter, api, toast, modal, errorList } = window.UI;
  const $ = (s, el = document) => el.querySelector(s);
  const state = { courses: [], cert: '', form: '' };

  // ------------------------------------------------------------ khởi tạo
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'lookup') { e.preventDefault(); openLookup(); }
    if (a.dataset.action === 'register-course') { e.preventDefault(); preselect(Number(a.dataset.course)); }
    if (a.dataset.action === 'register-class') { e.preventDefault(); preselect(Number(a.dataset.course), a.dataset.form, Number(a.dataset.class), a.dataset.shift); }
    if (a.dataset.action === 'course-detail') { e.preventDefault(); openCourse(Number(a.dataset.course)); }
  });
  $('#burger').onclick = () => $('#nav').classList.toggle('open');
  $('#nav').addEventListener('click', (e) => { if (e.target.tagName === 'A') $('#nav').classList.remove('open'); });

  api('GET', '/api/meta').then((m) => {
    const v = [m.stats.courses, m.stats.recruiting, m.stats.students, m.stats.teachers];
    document.querySelectorAll('#hero-stats b').forEach((b, i) => { b.textContent = new Intl.NumberFormat('vi-VN').format(v[i]); });
  }).catch(() => {});

  // ------------------------------------------------------------ CN1: khoá học
  const ACCENT = { IELTS: '#b3261e', TOEIC: '#1f4e8c', VSTEP: '#1e7b45', CAMBRIDGE: '#5b3fb3' };
  const CERT_LABEL = { IELTS: 'IELTS', TOEIC: 'TOEIC', VSTEP: 'VSTEP', CAMBRIDGE: 'Cambridge' };

  async function loadCourses() {
    $('#course-grid').innerHTML = Array(4).fill('<div class="card skeleton" style="height:300px"></div>').join('');
    state.courses = await api('GET', '/api/courses');
    const certs = [...new Set(state.courses.map((c) => c.certificate))];
    $('#cert-chips').innerHTML = ['', ...certs].map((c) => `<button class="chip ${c === state.cert ? 'active' : ''}" data-cert="${c}">${c ? CERT_LABEL[c] : 'Tất cả'}</button>`).join('');
    $('#cert-chips').onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      state.cert = b.dataset.cert;
      $('#cert-chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === b));
      renderCourses();
    };
    renderCourses();
    const sel = $('#r-course');
    sel.innerHTML = '<option value="">— Chọn khoá học —</option>' + state.courses.map((c) => `<option value="${c.course_id}">${esc(c.name)} – ${money(c.tuition_fee)}</option>`).join('');
  }

  function renderCourses() {
    const list = state.courses.filter((c) => !state.cert || c.certificate === state.cert);
    $('#course-grid').innerHTML = list.map((c) => `
      <article class="card course" style="--accent:${ACCENT[c.certificate]}">
        <div class="row"><span class="badge ${L.cert[c.certificate]} plain">${CERT_LABEL[c.certificate]}</span>${c.open_classes ? `<span class="tiny">${c.open_classes} lớp đang tuyển</span>` : '<span class="tiny">Sắp mở lớp</span>'}</div>
        <h3>${esc(c.name)}</h3>
        <div class="target">🎯 Mục tiêu: ${esc(c.target)}</div>
        <ul>${c.outcomes.slice(0, 3).map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        <div class="meta"><span>⏱ ${c.total_hours} giờ</span><span>💻 ${c.online_classes} online</span><span>🏫 ${c.offline_classes} offline</span>${c.next_start ? `<span>📅 KG ${date(c.next_start)}</span>` : ''}</div>
        <div class="price">${money(c.tuition_fee)}</div>
        <div class="actions"><button class="btn btn-outline btn-sm" data-action="course-detail" data-course="${c.course_id}">Lộ trình & lớp</button><button class="btn btn-primary btn-sm" data-action="register-course" data-course="${c.course_id}">Đăng ký</button></div>
      </article>`).join('');
  }

  async function openCourse(id) {
    const c = await api('GET', `/api/courses/${id}`);
    modal({
      title: esc(c.name), wide: true,
      body: `
        <div class="row" style="margin-bottom:12px"><span class="badge ${L.cert[c.certificate]} plain">${CERT_LABEL[c.certificate]}</span><span class="badge b-gold plain">Mục tiêu ${esc(c.target)}</span><span class="badge plain">${c.total_hours} giờ</span><div class="spacer"></div><b style="font-size:1.2rem;color:var(--red)">${money(c.tuition_fee)}</b></div>
        <p>${esc(c.description)}</p>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          <div><h4>Lộ trình học</h4><ul class="syllabus">${c.syllabus.map((s) => `<li><b>${esc(s.phase)}</b><div class="muted small">${esc(s.content)}</div></li>`).join('')}</ul></div>
          <div><h4>Chuẩn đầu ra</h4><ul>${c.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
        </div>
        <h4 style="margin-top:14px">Các lớp đang mở (${c.classes.length})</h4>
        <div class="class-list">${c.classes.length ? c.classes.map(classCard).join('') : '<div class="empty">Chưa có lớp – vui lòng để lại đăng ký, trung tâm sẽ liên hệ khi mở lớp.</div>'}</div>`,
    });
  }

  // ------------------------------------------------------------ CN3: tra cứu lớp
  function classCard(c) {
    const cap = c.capacity;
    const where = c.form === 'ONLINE' ? '💻 Học trực tuyến (Zoom/Meet)' : (c.room_name ? `🏫 ${esc(c.room_name)} – ${esc(c.campus)}` : '🏫 Đang bố trí phòng');
    const canReg = c.status === 'RECRUITING';
    return `<div class="card cls">
      <div><div class="code mono">${esc(c.code)}</div><h4>${esc(c.course_name)}</h4>
        <div class="tags"><span class="badge ${c.form === 'ONLINE' ? 'b-blue' : 'b-red'} plain">${L.form[c.form]}</span><span class="badge b-gold plain">Trình độ ${c.level}</span>${badge(L.classStatus[c.status])}</div></div>
      <div><div class="line">📅 Khai giảng <b>${date(c.start_date)}</b></div><div class="line">🕒 ${schedule(c.slots)}</div><div class="line">👩‍🏫 ${esc(c.teacher_name)}</div><div class="line">${where}</div></div>
      <div>${meter(cap)}<div class="cap-line"><span><b>${cap.enrolled}</b>/${cap.max} học viên</span><span>mở lớp từ ${cap.min}</span></div>
        <div style="margin-top:6px">${badge(L.cap[cap.capacityState])}</div>
        ${cap.capacityState === 'BELOW_MIN' ? `<div class="tiny">Cần thêm ${cap.neededToOpen} học viên để mở lớp</div>` : ''}</div>
      <div>${canReg ? `<button class="btn btn-primary btn-sm" data-action="register-class" data-course="${c.course_id}" data-form="${c.form}" data-class="${c.class_id}" data-shift="${c.slots[0] ? c.slots[0].shift : ''}">Đăng ký lớp này</button>` : '<span class="tiny">Lớp đang học</span>'}</div>
    </div>`;
  }

  const filters = $('#filters');
  let timer;
  const runSearch = () => { clearTimeout(timer); timer = setTimeout(search, 220); };
  filters.addEventListener('input', runSearch);
  filters.addEventListener('change', runSearch);
  filters.addEventListener('submit', (e) => { e.preventDefault(); search(); });
  $('#f-form').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.form = b.dataset.v;
    $('#f-form').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    search();
  };
  $('#f-reset').onclick = () => { filters.reset(); state.form = ''; $('#f-form').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0)); search(); };

  async function search() {
    const fd = new FormData(filters);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (v) p.set(k, k === 'available' ? '1' : v);
    if (state.form) p.set('form', state.form);
    const list = $('#class-list');
    list.innerHTML = '<div class="card skeleton" style="height:96px"></div>'.repeat(3);
    try {
      const rows = await api('GET', `/api/classes?${p}`);
      $('#result-meta').textContent = `Tìm thấy ${rows.length} lớp đang tuyển sinh${p.toString() ? ' phù hợp bộ lọc' : ''}.`;
      list.innerHTML = rows.length ? rows.map(classCard).join('')
        : '<div class="card empty"><div class="ico">🔍</div><b>Không có lớp phù hợp</b><p class="small">Hãy nới bộ lọc hoặc để lại đăng ký – trung tâm sẽ mở lớp khi đủ sĩ số.</p></div>';
    } catch (err) { list.innerHTML = `<div class="alert alert-red">${esc(err.message)}</div>`; }
  }

  // ------------------------------------------------------------ CN2: đăng ký
  const form = $('#reg-form');
  async function refreshClassOptions(selectedId) {
    const courseId = form.course_id.value;
    const f = form.desired_form.value;
    const sel = $('#r-class');
    sel.innerHTML = '<option value="">Để văn phòng xếp theo kết quả kiểm tra</option>';
    const c = state.courses.find((x) => String(x.course_id) === courseId);
    $('#fee-value').textContent = c ? money(c.tuition_fee) : '—';
    $('#fee-desc').innerHTML = c ? `${esc(c.name)} · ${c.total_hours} giờ · mục tiêu ${esc(c.target)}` : 'Chọn khoá học để xem học phí và lộ trình.';
    if (!courseId) return;
    const rows = await api('GET', `/api/classes?course_id=${courseId}&form=${f}`);
    sel.innerHTML += rows.map((r) => `<option value="${r.class_id}" ${r.class_id === selectedId ? 'selected' : ''}>${esc(r.code)} · ${r.level} · KG ${date(r.start_date)} · ${schedule(r.slots)} · ${r.capacity.enrolled}/${r.capacity.max}</option>`).join('');
  }
  form.course_id.addEventListener('change', () => refreshClassOptions());
  form.querySelectorAll('[name=desired_form]').forEach((r) => r.addEventListener('change', () => refreshClassOptions()));

  async function preselect(courseId, f, classId, shift) {
    form.course_id.value = courseId;
    if (f) form.querySelector(`[name=desired_form][value=${f}]`).checked = true;
    if (shift) form.desired_shift.value = shift;
    await refreshClassOptions(classId);
    document.getElementById('dang-ky').scrollIntoView();
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
    setTimeout(() => form.full_name.focus(), 400);
  }

  const PHONE_RE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
  function clientValidate(dto) {
    const e = {};
    if ((dto.full_name || '').trim().split(/\s+/).length < 2) e.full_name = 'Vui lòng nhập đầy đủ họ và tên.';
    if (!PHONE_RE.test((dto.phone || '').replace(/[\s.]/g, ''))) e.phone = 'Số điện thoại di động Việt Nam không hợp lệ.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dto.email || '')) e.email = 'Email không hợp lệ.';
    if (!dto.course_id) e.course_id = 'Vui lòng chọn khoá học.';
    return e;
  }
  function showErrors(errors) {
    form.querySelectorAll('.err').forEach((el) => { el.textContent = errors[el.dataset.for] || ''; });
    form.querySelectorAll('.input').forEach((el) => el.classList.toggle('invalid', !!errors[el.name]));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dto = Object.fromEntries(new FormData(form).entries());
    const errors = clientValidate(dto);
    showErrors(errors);
    if (Object.keys(errors).length) { form.querySelector('.invalid')?.focus(); return; }
    const btn = $('#reg-submit');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang gửi…';
    try {
      const r = await api('POST', '/api/registrations', { ...dto, course_id: Number(dto.course_id), desired_class_id: dto.desired_class_id ? Number(dto.desired_class_id) : null });
      const phone = dto.phone;
      form.reset(); showErrors({}); refreshClassOptions();
      const m = modal({
        title: '🎉 Đăng ký thành công',
        body: `<div class="result-big"><div class="muted">Mã hồ sơ của bạn</div><div class="mono" style="font-size:2rem;font-weight:800;margin:6px 0">${esc(r.reg_code)}</div>
          <p class="muted">Khoá <b>${esc(r.course_name)}</b> · Học phí <b>${money(r.tuition_fee)}</b></p></div>
          <div class="alert alert-blue">Vui lòng lưu lại mã hồ sơ. Bước tiếp theo: <b>nộp học phí</b>, sau đó làm <b>bài kiểm tra đầu vào</b> để được xếp lớp đúng trình độ.</div>`,
        foot: '<button class="btn btn-ghost" data-close>Để sau</button><button class="btn btn-primary" data-pay>Nộp học phí ngay</button>',
      });
      m.el.querySelector('[data-close]').onclick = m.close;
      m.el.querySelector('[data-pay]').onclick = () => { m.close(); openLookup(r.reg_code, phone); };
    } catch (err) {
      if (err.details && !Array.isArray(err.details)) showErrors(err.details);
      toast('Không gửi được đăng ký', esc(err.message), 'bad');
    } finally { btn.disabled = false; btn.textContent = 'Gửi đăng ký'; }
  });

  // ------------------------------------------------------------ Tra cứu hồ sơ
  function openLookup(code = '', phone = '') {
    const saved = JSON.parse(sessionStorage.getItem('lookup') || '{}');
    code = code || saved.code || ''; phone = phone || saved.phone || '';
    const m = modal({
      title: 'Tra cứu hồ sơ đăng ký', wide: true,
      body: `<form id="lk-form" class="row" style="align-items:flex-end">
          <div class="field" style="flex:1 1 180px"><label>Mã hồ sơ</label><input class="input mono" name="code" value="${esc(code)}" placeholder="DK-2026-0001" required></div>
          <div class="field" style="flex:1 1 180px"><label>Số điện thoại đăng ký</label><input class="input" name="phone" value="${esc(phone)}" placeholder="09xx xxx xxx" required></div>
          <button class="btn btn-navy">Tra cứu</button></form>
        <div id="lk-out" style="margin-top:18px"></div>`,
    });
    const f = m.el.querySelector('#lk-form');
    f.onsubmit = (e) => { e.preventDefault(); showReg(m, f.code.value.trim(), f.phone.value.trim()); };
    if (code && phone) showReg(m, code, phone);
  }

  async function showReg(m, code, phone) {
    const out = m.el.querySelector('#lk-out');
    out.innerHTML = '<div class="skeleton" style="height:160px"></div>';
    try {
      const r = await api('POST', '/api/registrations/lookup', { code, phone });
      sessionStorage.setItem('lookup', JSON.stringify({ code: r.reg_code, phone }));
      const order = ['PENDING_PAYMENT', 'PAID', 'TESTED', 'ENROLLED'];
      let idx = order.indexOf(r.status === 'WAITING_APPROVAL' ? 'TESTED' : r.status);
      if (r.status === 'ENROLLED') idx = 4;
      const steps = ['Đăng ký', 'Nộp học phí', 'Kiểm tra đầu vào', 'Xếp lớp'];
      let action = '';
      if (r.status === 'PENDING_PAYMENT') action = `<div class="card card-pad"><h4>Nộp học phí: ${money(r.tuition_fee)}</h4>
          <div class="pay-methods"><label><input type="radio" name="pm" value="VNPAY" checked>VNPay</label><label><input type="radio" name="pm" value="MOMO">Ví MoMo</label><label><input type="radio" name="pm" value="BANK">Chuyển khoản</label></div>
          <p class="tiny" style="margin-top:8px">Cổng thanh toán mô phỏng cho prototype. Có thể nộp tiền mặt tại quầy giáo vụ.</p>
          <button class="btn btn-primary" id="do-pay">Thanh toán ${money(r.tuition_fee)}</button></div>`;
      if (r.status === 'PAID') action = `<div class="card card-pad"><h4>Bài kiểm tra trình độ đầu vào</h4><p class="muted small">20 câu trắc nghiệm (ngữ pháp, từ vựng, đọc hiểu) trong 20 phút. Mỗi hồ sơ được làm <b>1 lần</b>. Kết quả được chuyển về văn phòng để xếp lớp.</p>
          ${r.started_at && !r.submitted_at ? '<div class="alert alert-amber" style="margin-bottom:10px">Bạn đang có bài làm dở – thời gian vẫn được tính.</div>' : ''}
          <button class="btn btn-primary" id="do-test">${r.started_at ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}</button></div>`;
      if (r.status === 'TESTED') action = `<div class="alert alert-blue">Đã có kết quả <b>${r.assessed_level}</b> (${r.score}/${r.total}). Văn phòng sẽ xếp lớp phù hợp và thông báo qua SĐT/email.</div>`;
      if (r.status === 'WAITING_APPROVAL') action = `<div class="alert alert-amber">Lớp <b>${esc(r.class_code)}</b> đã đủ 30 học viên. Hồ sơ đang chờ <b>Lãnh đạo trung tâm</b> quyết định tách lớp / bổ sung chỗ.</div>`;
      if (r.status === 'ENROLLED') action = `<div class="alert alert-green">Bạn đã được xếp vào lớp <b>${esc(r.class_code)}</b> (${L.form[r.class_form]}, trình độ ${r.class_level}), khai giảng <b>${date(r.class_start)}</b>.</div>`;
      if (r.status === 'CANCELLED') action = '<div class="alert alert-red">Hồ sơ đã bị huỷ.</div>';
      out.innerHTML = `<div class="reg-summary">
        <div class="steps">${steps.map((s, i) => `<div class="step ${i < idx ? 'done' : i === idx ? 'cur' : ''}"><div class="dot">${i < idx ? '✓' : i + 1}</div>${s}</div>`).join('')}</div>
        <dl class="kv"><dt>Mã hồ sơ</dt><dd class="mono">${esc(r.reg_code)}</dd><dt>Học viên</dt><dd>${esc(r.full_name)}</dd>
          <dt>Khoá học</dt><dd>${esc(r.course_name)}</dd><dt>Mong muốn</dt><dd>${L.form[r.desired_form]} · ca ${L.shift[r.desired_shift]}${r.desired_class_code ? ` · lớp ${esc(r.desired_class_code)}` : ''}</dd>
          <dt>Trạng thái</dt><dd>${badge(L.reg[r.status])}</dd>
          ${r.paid_at ? `<dt>Thanh toán</dt><dd>${money(r.paid_amount)} · ${L.pay[r.pay_method]} · <span class="mono small">${esc(r.txn_code)}</span></dd>` : ''}
          ${r.assessed_level ? `<dt>Kết quả đầu vào</dt><dd>${r.score}/${r.total} câu · trình độ <b>${r.assessed_level}</b></dd>` : ''}</dl>
        ${action}</div>`;
      const pay = out.querySelector('#do-pay');
      if (pay) pay.onclick = async () => {
        pay.disabled = true; pay.innerHTML = '<span class="spinner"></span> Đang kết nối cổng thanh toán…';
        try {
          await new Promise((res) => setTimeout(res, 700));
          const p = await api('POST', `/api/registrations/${r.reg_code}/pay`, { phone, method: out.querySelector('[name=pm]:checked').value });
          toast('Thanh toán thành công', `Mã giao dịch ${esc(p.txn_code)}`, 'ok');
          showReg(m, code, phone);
        } catch (err) { toast('Thanh toán thất bại', esc(err.message), 'bad'); pay.disabled = false; }
      };
      const tbtn = out.querySelector('#do-test');
      if (tbtn) tbtn.onclick = () => { m.close(); openTest(r.reg_code, phone); };
    } catch (err) {
      out.innerHTML = `<div class="alert alert-red">${esc(err.message)}</div>`;
    }
  }

  // ------------------------------------------------------------ Bài kiểm tra đầu vào
  async function openTest(code, phone) {
    let data;
    try { data = await api('POST', `/api/placement/${code}/start`, { phone }); } catch (err) { toast('Không thể làm bài', esc(err.message), 'bad'); return; }
    const key = `answers:${code}`;
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    const m = modal({
      title: `Kiểm tra đầu vào · <span class="mono">${esc(code)}</span>`, wide: true,
      body: `<div class="row" style="position:sticky;top:-22px;background:var(--surface);padding:8px 0;z-index:1;border-bottom:1px solid var(--border)">
          <span class="muted small">Đã trả lời <b id="t-done">0</b>/${data.questions.length}</span><div class="spacer"></div><span class="timer" id="t-timer">--:--</span></div>
        <form id="t-form">${data.questions.map((q, i) => `<div class="q"><div class="qt">Câu ${i + 1}. ${esc(q.content)} <span class="tiny">· ${q.skill}</span></div>
          <div class="opts">${q.options.map((o, j) => `<label><input type="radio" name="${q.question_id}" value="${j}" ${String(saved[q.question_id]) === String(j) ? 'checked' : ''}> ${'ABCD'[j]}. ${esc(o)}</label>`).join('')}</div></div>`).join('')}</form>`,
      foot: '<button class="btn btn-primary" id="t-submit">Nộp bài</button>',
      onClose: () => clearInterval(tick),
    });
    const f = m.el.querySelector('#t-form');
    const updateDone = () => { m.el.querySelector('#t-done').textContent = f.querySelectorAll('input:checked').length; };
    f.addEventListener('change', (e) => { saved[e.target.name] = e.target.value; localStorage.setItem(key, JSON.stringify(saved)); updateDone(); });
    updateDone();
    const timerEl = m.el.querySelector('#t-timer');
    const tick = setInterval(() => {
      const left = Math.max(0, data.deadline - Date.now());
      timerEl.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      timerEl.classList.toggle('low', left < 120000);
      if (left <= 0) { clearInterval(tick); submit(true); }
    }, 500);
    const submit = async (auto) => {
      const answered = f.querySelectorAll('input:checked').length;
      if (!auto && answered < data.questions.length && !confirm(`Bạn mới trả lời ${answered}/${data.questions.length} câu. Vẫn nộp bài?`)) return;
      clearInterval(tick);
      const answers = Object.fromEntries([...f.querySelectorAll('input:checked')].map((i) => [i.name, Number(i.value)]));
      try {
        const r = await api('POST', `/api/placement/${code}/submit`, { phone, answers });
        localStorage.removeItem(key);
        m.close();
        const desc = { A1: 'Sơ cấp', A2: 'Sơ trung cấp', B1: 'Trung cấp', B2: 'Trung cao cấp', C1: 'Cao cấp' };
        const done = modal({
          title: 'Kết quả kiểm tra đầu vào',
          body: `<div class="result-big"><div class="muted">Trình độ CEFR</div><div class="lv">${r.level}</div><p><b>${desc[r.level]}</b> · ${r.score}/${r.total} câu đúng</p></div>
            <div class="alert alert-green">Kết quả đã được chuyển về <b>Văn phòng trung tâm</b>. Giáo vụ sẽ xếp bạn vào lớp đúng trình độ và thông báo lịch học.</div>`,
          foot: '<button class="btn btn-primary" data-x>Xem hồ sơ</button>',
        });
        done.el.querySelector('[data-x]').onclick = () => { done.close(); openLookup(code, phone); };
      } catch (err) { toast('Không nộp được bài', esc(err.message), 'bad'); }
    };
    m.el.querySelector('#t-submit').onclick = () => submit(false);
  }

  loadCourses().catch((e) => toast('Lỗi tải khoá học', esc(e.message), 'bad'));
  search();
  window.Portal = { openLookup };
})();
