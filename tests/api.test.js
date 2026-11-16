// Kiểm thử tích hợp REST API trên CSDL tạm: luồng đăng ký → thu phí → thi → xếp lớp → tờ trình → phê duyệt.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let t; // { api, db, stop }
const tok = {};
const classByCode = (code) => t.db.get().prepare('SELECT * FROM classes WHERE code = ?').get(code);
const counts = (id) => t.db.get().prepare('SELECT enrolled, waiting FROM v_class_enrollment WHERE class_id = ?').get(id);

before(async () => {
  t = await startTestServer('api');
  for (const u of ['tuvan1', 'giaovu', 'lanhdao']) {
    const r = await t.api('POST', '/api/auth/login', { username: u, password: '123456' });
    tok[u] = r.body.token;
  }
});
after(() => t.stop());

/** Tạo nhanh 1 hồ sơ đã thi xong cho khoá + trình độ mong muốn (đi qua API thật). */
let seq = 0;
async function makeTested(courseCode, form, shift) {
  seq++;
  const course = t.db.get().prepare('SELECT course_id FROM courses WHERE code = ?').get(courseCode);
  const phone = `09${String(70000000 + seq)}`;
  const reg = await t.api('POST', '/api/registrations', {
    full_name: `Học Viên Thử ${seq}`, phone, email: `hv${seq}@test.vn`, course_id: course.course_id, desired_form: form, desired_shift: shift,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  await t.api('POST', `/api/registrations/${reg.body.reg_code}/pay`, { phone, method: 'MOMO' });
  const start = await t.api('POST', `/api/placement/${reg.body.reg_code}/start`, { phone });
  await t.api('POST', `/api/placement/${reg.body.reg_code}/submit`, { phone, answers: {} });
  const row = t.db.get().prepare('SELECT registration_id FROM registrations WHERE reg_code = ?').get(reg.body.reg_code);
  return { id: row.registration_id, code: reg.body.reg_code, phone, questions: start.body.questions };
}

describe('Chức năng 1 & 3 – quảng bá và tra cứu lớp', () => {
  test('Danh mục khoá học có học phí, chuẩn đầu ra, lộ trình', async () => {
    const r = await t.api('GET', '/api/courses');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 8);
    assert.ok(r.body[0].tuition_fee > 0 && r.body[0].outcomes.length > 0 && r.body[0].syllabus.length > 0);
  });
  test('Lọc lớp theo hình thức + trình độ + ca', async () => {
    const r = await t.api('GET', '/api/classes?form=OFFLINE&level=B1&shift=EVENING');
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 1);
    for (const c of r.body) {
      assert.equal(c.form, 'OFFLINE');
      assert.equal(c.level, 'B1');
      assert.ok(c.slots.some((s) => s.shift === 'EVENING'));
    }
  });
  test('Lọc "còn chỗ" loại bỏ lớp đầy / chờ duyệt', async () => {
    const r = await t.api('GET', '/api/classes?available=1');
    assert.ok(r.body.every((c) => c.capacity.seatsLeft > 0 && c.capacity.waiting === 0));
  });
  test('Tham số độc hại không gây lỗi SQL (truy vấn tham số hoá)', async () => {
    const r = await t.api('GET', `/api/classes?q=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 0);
  });
});

describe('Chức năng 2 – đăng ký, thu học phí, kiểm tra đầu vào', () => {
  let code; const phone = '0933111222';
  test('Đăng ký hợp lệ → 201, trạng thái PENDING_PAYMENT', async () => {
    const r = await t.api('POST', '/api/registrations', { full_name: 'Đỗ Thử Nghiệm', phone, email: 'do.thu@test.vn', course_id: 2, desired_form: 'ONLINE', desired_shift: 'EVENING' });
    assert.equal(r.status, 201);
    assert.match(r.body.reg_code, /^DK-\d{4}-\d{4}$/);
    code = r.body.reg_code;
  });
  test('Đăng ký trùng khoá → 409', async () => {
    const r = await t.api('POST', '/api/registrations', { full_name: 'Đỗ Thử Nghiệm', phone, email: 'do.thu@test.vn', course_id: 2, desired_form: 'ONLINE', desired_shift: 'EVENING' });
    assert.equal(r.status, 409);
  });
  test('Dữ liệu sai → 400 kèm lỗi từng trường', async () => {
    const r = await t.api('POST', '/api/registrations', { full_name: 'A', phone: '1', email: 'x', course_id: 0 });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.phone && r.body.details.email && r.body.details.desired_form);
  });
  test('Tra cứu sai SĐT → 404 (không lộ dữ liệu cá nhân)', async () => {
    assert.equal((await t.api('POST', '/api/registrations/lookup', { code, phone: '0900000000' })).status, 404);
  });
  test('BR-01: làm bài khi chưa nộp học phí → 403', async () => {
    const r = await t.api('POST', `/api/placement/${code}/start`, { phone });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'PAYMENT_REQUIRED');
  });
  test('Thanh toán → PAID; thanh toán lần 2 → 409', async () => {
    assert.equal((await t.api('POST', `/api/registrations/${code}/pay`, { phone, method: 'VNPAY' })).body.status, 'PAID');
    assert.equal((await t.api('POST', `/api/registrations/${code}/pay`, { phone, method: 'VNPAY' })).status, 409);
  });
  test('Làm bài: 20 câu, không lộ đáp án; nộp bài → chấm điểm + CEFR', async () => {
    const s = await t.api('POST', `/api/placement/${code}/start`, { phone });
    assert.equal(s.status, 200);
    assert.equal(s.body.questions.length, 20);
    assert.ok(s.body.questions.every((q) => q.answer_index === undefined));
    const key = Object.fromEntries(t.db.get().prepare('SELECT question_id, answer_index FROM placement_questions').all().map((q) => [q.question_id, q.answer_index]));
    const answers = Object.fromEntries(s.body.questions.slice(0, 15).map((q) => [q.question_id, key[q.question_id]]));
    const sub = await t.api('POST', `/api/placement/${code}/submit`, { phone, answers });
    assert.equal(sub.body.score, 15);
    assert.equal(sub.body.level, 'B2');
    const look = await t.api('POST', '/api/registrations/lookup', { code, phone });
    assert.equal(look.body.status, 'TESTED');
  });
  test('Nộp bài lần 2 → 409', async () => {
    assert.equal((await t.api('POST', `/api/placement/${code}/submit`, { phone, answers: {} })).status, 409);
  });
});

describe('Phân quyền', () => {
  test('API quản trị không có token → 401', async () => {
    assert.equal((await t.api('GET', '/api/admin/dashboard')).status, 401);
  });
  test('Sai mật khẩu → 401', async () => {
    assert.equal((await t.api('POST', '/api/auth/login', { username: 'giaovu', password: 'x' })).status, 401);
  });
  test('Tư vấn viên không được xếp lớp → 403', async () => {
    assert.equal((await t.api('POST', '/api/admin/registrations/1/enroll', { class_id: 1 }, tok.tuvan1)).status, 403);
  });
  test('Dashboard trả về KPI và dữ liệu biểu đồ', async () => {
    const r = await t.api('GET', '/api/admin/dashboard', null, tok.giaovu);
    assert.equal(r.status, 200);
    assert.ok(r.body.kpis.revenueTotal > 0);
    assert.equal(r.body.revenueByMonth.length, 6);
    assert.equal(r.body.funnel.length, 4);
  });
});

describe('Xếp lớp & tờ trình vượt sĩ số (BR-04)', () => {
  test('Học viên thứ 30 vào lớp offline → ENROLLED; thứ 31 → chờ duyệt + tờ trình', async () => {
    const cls = classByCode('VSTEP-B1-B1-OFF-01');
    assert.equal(counts(cls.class_id).enrolled, 29);
    const a = await makeTested('VSTEP-B1', 'OFFLINE', 'EVENING');
    const b = await makeTested('VSTEP-B1', 'OFFLINE', 'EVENING');
    const level = (id) => t.db.get().prepare('SELECT level FROM placement_attempts WHERE registration_id = ?').get(id).level;
    const reason = level(a.id) === 'B1' ? undefined : 'Kiểm thử tự động';
    const r30 = await t.api('POST', `/api/admin/registrations/${a.id}/enroll`, { class_id: cls.class_id, reason }, tok.giaovu);
    assert.equal(r30.body.result, 'ENROLLED', JSON.stringify(r30.body));
    const r31 = await t.api('POST', `/api/admin/registrations/${b.id}/enroll`, { class_id: cls.class_id, reason: 'Kiểm thử tự động' }, tok.giaovu);
    assert.equal(r31.body.result, 'WAITING_APPROVAL');
    assert.deepEqual(counts(cls.class_id), { enrolled: 30, waiting: 1 });
    const pending = t.db.get().prepare("SELECT * FROM approval_requests WHERE class_id = ? AND status = 'PENDING'").get(cls.class_id);
    assert.ok(pending);
  });
  test('Lệch trình độ mà không ghi lý do → 422', async () => {
    const x = await makeTested('CAM-B2', 'ONLINE', 'MORNING');
    const lv = t.db.get().prepare('SELECT level FROM placement_attempts WHERE registration_id = ?').get(x.id).level;
    const other = t.db.get().prepare("SELECT class_id FROM classes c JOIN courses co USING(course_id) WHERE co.code = 'CAM-B2' AND c.level <> ? AND c.status = 'RECRUITING'").get(lv);
    const r = await t.api('POST', `/api/admin/registrations/${x.id}/enroll`, { class_id: other.class_id }, tok.giaovu);
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'LEVEL_MISMATCH');
  });
  test('Không mở được lớp khi còn tờ trình chờ', async () => {
    const cls = classByCode('VSTEP-B1-B1-OFF-01');
    const r = await t.api('POST', `/api/admin/classes/${cls.class_id}/open`, null, tok.giaovu);
    assert.equal(r.status, 422);
  });
  test('Giáo vụ không có quyền phê duyệt → 403', async () => {
    const req = t.db.get().prepare("SELECT request_id FROM approval_requests WHERE status = 'PENDING' LIMIT 1").get();
    assert.equal((await t.api('POST', `/api/admin/approvals/${req.request_id}/decide`, { decision: 'KEEP' }, tok.giaovu)).status, 403);
  });
  test('Lãnh đạo "giữ ngoại lệ" (phòng 45 chỗ) → lớp 31 học viên', async () => {
    const cls = classByCode('VSTEP-B1-B1-OFF-01');
    const req = t.db.get().prepare("SELECT request_id FROM approval_requests WHERE class_id = ? AND status = 'PENDING'").get(cls.class_id);
    const r = await t.api('POST', `/api/admin/approvals/${req.request_id}/decide`, { decision: 'KEEP', note: 'Phòng hội trường đủ chỗ' }, tok.lanhdao);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(counts(cls.class_id), { enrolled: 31, waiting: 0 });
  });
  test('Lãnh đạo "tách lớp" 30 + 12 = 42 → chia đều 21 / 21, lớp mới có lịch + phòng', async () => {
    const cls = classByCode('VSTEP-B1-A2-OFF-02');
    assert.deepEqual(counts(cls.class_id), { enrolled: 30, waiting: 12 });
    const list = await t.api('GET', '/api/admin/approvals?status=PENDING', null, tok.lanhdao);
    const item = list.body.find((x) => x.class_id === cls.class_id);
    assert.equal(item.proposal.recommended, 'SPLIT');
    assert.equal(item.proposal.options.KEEP.feasible, false); // phòng 35 chỗ < 42
    const r = await t.api('POST', `/api/admin/approvals/${item.request_id}/decide`, { decision: 'SPLIT' }, tok.lanhdao);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(counts(cls.class_id), { enrolled: 21, waiting: 0 });
    assert.deepEqual(counts(r.body.result_class_id), { enrolled: 21, waiting: 0 });
    const child = t.db.get().prepare('SELECT * FROM classes WHERE class_id = ?').get(r.body.result_class_id);
    assert.equal(child.parent_class_id, cls.class_id);
    assert.ok(child.room_id, 'lớp mới được tự gợi ý phòng trống');
  });
  test('Tờ trình đã xử lý không quyết định lại được → 409', async () => {
    const req = t.db.get().prepare("SELECT request_id FROM approval_requests WHERE status = 'APPROVED' LIMIT 1").get();
    assert.equal((await t.api('POST', `/api/admin/approvals/${req.request_id}/decide`, { decision: 'REJECT' }, tok.lanhdao)).status, 409);
  });
  test('Từ chối tờ trình → hồ sơ chờ trở về TESTED', async () => {
    const cls = classByCode('IELTS-I-B1-OFF-02');
    const req = t.db.get().prepare("SELECT request_id FROM approval_requests WHERE class_id = ? AND status = 'PENDING'").get(cls.class_id);
    await t.api('POST', `/api/admin/approvals/${req.request_id}/decide`, { decision: 'REJECT', note: 'Chuyển sang lớp khác' }, tok.lanhdao);
    assert.deepEqual(counts(cls.class_id), { enrolled: 30, waiting: 0 });
  });
});

describe('Lịch học, phòng học, mở lớp (BR-05, BR-08)', () => {
  test('Lớp offline đủ sĩ số nhưng chưa có phòng → không mở được', async () => {
    const cls = classByCode('VSTEP-B2-B2-OFF-01');
    const r = await t.api('POST', `/api/admin/classes/${cls.class_id}/open`, null, tok.giaovu);
    assert.equal(r.status, 422);
    assert.ok(r.body.details.some((x) => x.includes('phân phòng')));
  });
  test('Gán phòng trùng lịch lớp khác → 422 SCHEDULE_CONFLICT', async () => {
    const cls = classByCode('VSTEP-B2-B2-OFF-01');
    const busy = classByCode('IELTS-I-B1-OFF-02'); // P.201, tối 3-5-7
    const r = await t.api('PUT', `/api/admin/classes/${cls.class_id}/arrangement`, {
      room_id: busy.room_id, teacher_id: cls.teacher_id, slots: [{ weekday: 3, shift: 'EVENING' }],
    }, tok.giaovu);
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'SCHEDULE_CONFLICT');
  });
  test('Gán phòng trống hợp lệ rồi mở lớp → IN_PROGRESS', async () => {
    const cls = classByCode('VSTEP-B2-B2-OFF-01');
    const room = t.db.get().prepare("SELECT room_id FROM rooms WHERE name = 'P.302'").get();
    const a = await t.api('PUT', `/api/admin/classes/${cls.class_id}/arrangement`, {
      room_id: room.room_id, teacher_id: cls.teacher_id, slots: [{ weekday: 3, shift: 'AFTERNOON' }, { weekday: 5, shift: 'AFTERNOON' }],
    }, tok.giaovu);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const o = await t.api('POST', `/api/admin/classes/${cls.class_id}/open`, null, tok.giaovu);
    assert.equal(o.body.status, 'IN_PROGRESS');
  });
  test('Lớp online 8 học viên (< 10) không mở được', async () => {
    const cls = classByCode('IELTS-F-B1-ON-01');
    assert.equal((await t.api('POST', `/api/admin/classes/${cls.class_id}/open`, null, tok.giaovu)).status, 422);
  });
  test('Huỷ lớp → học viên trở về danh sách chờ xếp lớp', async () => {
    const cls = classByCode('CAM-B2-B1-OFF-01');
    const before = counts(cls.class_id).enrolled;
    const r = await t.api('POST', `/api/admin/classes/${cls.class_id}/cancel`, { note: 'Không đủ sĩ số' }, tok.giaovu);
    assert.equal(r.body.released, before);
    assert.equal(counts(cls.class_id).enrolled, 0);
  });
});

describe('Tách thành nhiều lớp và chống dò mật khẩu', () => {
  test('30 + 35 hồ sơ chờ → tách 3 lớp 22 / 22 / 21, mỗi lớp mới có giảng viên không trùng lịch', async () => {
    const d = t.db.get();
    const cls = classByCode('IELTS-F-A2-OFF-02'); // đang 24 học viên
    const insS = d.prepare('INSERT INTO students (full_name, phone, email) VALUES (?, ?, ?)');
    const insR = d.prepare("INSERT INTO registrations (reg_code, student_id, course_id, desired_form, desired_shift, class_id, status) VALUES (?, ?, ?, 'OFFLINE', 'EVENING', ?, ?)");
    for (let i = 0; i < 41; i++) {
      const sid = insS.run(`Học Viên Đông ${i}`, `098${String(1000000 + i)}`, `dong${i}@test.vn`).lastInsertRowid;
      insR.run(`DK-2099-${String(i).padStart(4, '0')}`, sid, cls.course_id, cls.class_id, i < 6 ? 'ENROLLED' : 'WAITING_APPROVAL');
    }
    const reqId = d.prepare("INSERT INTO approval_requests (class_id, reason, proposed_action) VALUES (?, 'Kiểm thử 30 + 35', 'SPLIT')").run(cls.class_id).lastInsertRowid;
    assert.deepEqual(counts(cls.class_id), { enrolled: 30, waiting: 35 });
    const r = await t.api('POST', `/api/admin/approvals/${reqId}/decide`, { decision: 'SPLIT' }, tok.lanhdao);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const children = d.prepare('SELECT * FROM classes WHERE parent_class_id = ? ORDER BY class_id').all(cls.class_id);
    assert.equal(children.length, 2);
    const sizes = [cls, ...children].map((c) => counts(c.class_id).enrolled);
    assert.deepEqual(sizes, [22, 22, 21]);
    assert.equal(counts(cls.class_id).waiting, 0);
    assert.notEqual(children[0].teacher_id, children[1].teacher_id); // cùng lịch nên phải khác giảng viên
    assert.ok(!children[0].room_id || children[0].room_id !== children[1].room_id);
  });
  test('Sai mật khẩu 8 lần liên tiếp → lần thứ 9 bị khoá tạm (429) kể cả khi nhập đúng', async () => {
    assert.equal((await t.api('POST', '/api/auth/login', { username: 'giaovu', password: '123456' })).status, 200); // đăng nhập đúng xoá bộ đếm
    for (let i = 0; i < 8; i++) assert.equal((await t.api('POST', '/api/auth/login', { username: 'giaovu', password: 'sai' + i })).status, 401);
    const r = await t.api('POST', '/api/auth/login', { username: 'giaovu', password: '123456' });
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'TOO_MANY_ATTEMPTS');
  });
});
