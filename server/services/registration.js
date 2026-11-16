// Chức năng 2 (Nhận đăng ký) + Thu học phí
const crypto = require('crypto');
const db = require('../db/connection');
const rules = require('../domain/rules');
const { badRequest, notFound, conflict, forbidden } = require('./errors');

const normPhone = (p) => String(p || '').replace(/[\s.]/g, '').replace(/^\+84/, '0');

function nextRegCode() {
  const year = new Date().getFullYear();
  const row = db.get().prepare("SELECT reg_code FROM registrations WHERE reg_code LIKE ? ORDER BY reg_code DESC LIMIT 1").get(`DK-${year}-%`);
  const seq = row ? Number(row.reg_code.split('-')[2]) + 1 : 1;
  return `DK-${year}-${String(seq).padStart(4, '0')}`;
}

/** UC-03: tạo hồ sơ đăng ký. */
function create(dto) {
  const { valid, errors } = rules.validateRegistration(dto);
  if (!valid) throw badRequest('Dữ liệu đăng ký chưa hợp lệ.', errors);

  const phone = normPhone(dto.phone);
  const email = dto.email.trim().toLowerCase();
  const courseId = Number(dto.course_id);
  const d = db.get();

  return db.tx(() => {
    const course = d.prepare('SELECT * FROM courses WHERE course_id = ? AND is_published = 1').get(courseId);
    if (!course) throw badRequest('Khoá học không tồn tại.', { course_id: 'Khoá học không tồn tại.' });

    let desiredClassId = null;
    if (dto.desired_class_id) {
      const cls = d.prepare('SELECT * FROM classes WHERE class_id = ?').get(Number(dto.desired_class_id));
      if (!cls || cls.course_id !== courseId || cls.status !== 'RECRUITING') {
        throw badRequest('Lớp mong muốn không hợp lệ.', { desired_class_id: 'Lớp không thuộc khoá đã chọn hoặc đã ngừng tuyển sinh.' });
      }
      if (cls.form !== dto.desired_form) {
        throw badRequest('Hình thức không khớp lớp đã chọn.', { desired_form: `Lớp ${cls.code} học ${cls.form === 'ONLINE' ? 'Online' : 'Offline'}.` });
      }
      desiredClassId = cls.class_id;
    }

    // Tìm học viên cũ theo email/SĐT, tránh tạo trùng
    const matches = d.prepare('SELECT * FROM students WHERE email = ? OR phone = ?').all(email, phone);
    if (matches.length > 1) throw conflict('CONTACT_MISMATCH', 'Email và số điện thoại thuộc về hai học viên khác nhau. Vui lòng kiểm tra lại.');
    let student = matches[0];
    if (student && (student.email !== email || student.phone !== phone)) {
      throw conflict('CONTACT_MISMATCH', 'Email hoặc số điện thoại đã được dùng bởi một học viên khác thông tin. Vui lòng liên hệ tư vấn viên.');
    }
    if (!student) {
      const info = d.prepare('INSERT INTO students (full_name, dob, phone, email) VALUES (?, ?, ?, ?)')
        .run(dto.full_name.trim(), dto.dob || null, phone, email);
      student = { student_id: info.lastInsertRowid };
    }

    const dup = d.prepare("SELECT reg_code FROM registrations WHERE student_id = ? AND course_id = ? AND status <> 'CANCELLED'").get(student.student_id, courseId);
    if (dup) throw conflict('DUPLICATE', `Bạn đã có hồ sơ ${dup.reg_code} cho khoá học này.`, { reg_code: dup.reg_code });

    const code = nextRegCode();
    d.prepare(`INSERT INTO registrations (reg_code, student_id, course_id, desired_form, desired_shift, desired_class_id, note)
               VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(code, student.student_id, courseId, dto.desired_form, dto.desired_shift, desiredClassId, (dto.note || '').trim() || null);
    return { reg_code: code, tuition_fee: course.tuition_fee, course_name: course.name, status: 'PENDING_PAYMENT' };
  });
}

const DETAIL_SQL = `
  SELECT r.*, s.full_name, s.phone, s.email, s.dob,
         co.name AS course_name, co.code AS course_code, co.tuition_fee, co.certificate,
         c.code AS class_code, c.form AS class_form, c.level AS class_level, c.start_date AS class_start,
         dc.code AS desired_class_code,
         p.amount AS paid_amount, p.method AS pay_method, p.txn_code, p.paid_at,
         a.score, a.total, a.level AS assessed_level, a.submitted_at, a.started_at
  FROM registrations r
  JOIN students s ON s.student_id = r.student_id
  JOIN courses co ON co.course_id = r.course_id
  LEFT JOIN classes c ON c.class_id = r.class_id
  LEFT JOIN classes dc ON dc.class_id = r.desired_class_id
  LEFT JOIN payments p ON p.registration_id = r.registration_id
  LEFT JOIN placement_attempts a ON a.registration_id = r.registration_id`;

/** Lấy hồ sơ theo mã + SĐT (bảo vệ dữ liệu cá nhân: phải khớp cả hai). */
function findByCodeAndPhone(code, phone) {
  const reg = db.get().prepare(`${DETAIL_SQL} WHERE r.reg_code = ?`).get(String(code || '').trim().toUpperCase());
  if (!reg || reg.phone !== normPhone(phone)) throw notFound('Không tìm thấy hồ sơ khớp mã hồ sơ và số điện thoại.');
  return reg;
}

function getById(id) {
  const reg = db.get().prepare(`${DETAIL_SQL} WHERE r.registration_id = ?`).get(id);
  if (!reg) throw notFound('Không tìm thấy hồ sơ.');
  return reg;
}

/** UC-04: ghi nhận thanh toán (cổng online mô phỏng hoặc tiền mặt do giáo vụ thu). */
function pay(reg, method, staffId = null) {
  if (!['VNPAY', 'MOMO', 'BANK', 'CASH'].includes(method)) throw badRequest('Phương thức thanh toán không hợp lệ.');
  if (method === 'CASH' && !staffId) throw forbidden('STAFF_ONLY', 'Thu tiền mặt chỉ do giáo vụ thực hiện tại quầy.');
  if (reg.status === 'CANCELLED') throw conflict('CANCELLED', 'Hồ sơ đã bị huỷ.');
  if (reg.status !== 'PENDING_PAYMENT') throw conflict('ALREADY_PAID', 'Hồ sơ đã được thanh toán trước đó.');
  const txn = `${method}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  db.tx(() => {
    db.get().prepare('INSERT INTO payments (registration_id, amount, method, txn_code, collected_by) VALUES (?, ?, ?, ?, ?)')
      .run(reg.registration_id, reg.tuition_fee, method, txn, staffId);
    const info = db.get().prepare("UPDATE registrations SET status = 'PAID', updated_at = datetime('now','localtime') WHERE registration_id = ? AND status = 'PENDING_PAYMENT'")
      .run(reg.registration_id);
    if (info.changes !== 1) throw conflict('ALREADY_PAID', 'Hồ sơ đã được thanh toán trước đó.');
  });
  return { txn_code: txn, amount: reg.tuition_fee, status: 'PAID' };
}

/** Danh sách hồ sơ cho văn phòng (lọc theo trạng thái / từ khoá / khoá học). */
function list({ status, q, course_id } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (course_id) { where.push('r.course_id = ?'); params.push(Number(course_id)); }
  if (q) {
    where.push('(r.reg_code LIKE ? OR s.full_name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like, like, like);
  }
  return db.get().prepare(`${DETAIL_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.updated_at DESC, r.registration_id DESC LIMIT 1000`).all(...params);
}

function cancel(id) {
  const reg = getById(id);
  if (!['PENDING_PAYMENT'].includes(reg.status)) throw conflict('CANNOT_CANCEL', 'Chỉ huỷ được hồ sơ chưa thanh toán. Hồ sơ đã nộp phí cần làm thủ tục hoàn phí riêng.');
  db.get().prepare("UPDATE registrations SET status = 'CANCELLED', updated_at = datetime('now','localtime') WHERE registration_id = ?").run(id);
  return getById(id);
}

module.exports = { create, findByCodeAndPhone, getById, pay, list, cancel, normPhone };
