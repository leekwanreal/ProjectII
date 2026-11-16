// Xếp lớp (BR-04, BR-06), tờ trình vượt sĩ số, lập lịch – phân phòng – mở lớp (BR-05, BR-08)
const db = require('../db/connection');
const rules = require('../domain/rules');
const catalog = require('./catalog');
const { CAPACITY } = require('../config');
const { notFound, conflict, unprocessable, badRequest } = require('./errors');

const now = "datetime('now','localtime')";

function counts(classId) {
  return db.get().prepare('SELECT enrolled, waiting FROM v_class_enrollment WHERE class_id = ?').get(classId);
}

function rawClass(id) {
  const c = db.get().prepare('SELECT c.*, r.capacity AS room_capacity FROM classes c LEFT JOIN rooms r ON r.room_id = c.room_id WHERE c.class_id = ?').get(id);
  if (!c) throw notFound('Không tìm thấy lớp học.');
  return c;
}

function activeClassesWithSlots(excludeId = null) {
  const rows = db.get().prepare("SELECT class_id, code, room_id, teacher_id, start_date, end_date FROM classes WHERE status IN ('RECRUITING','IN_PROGRESS') AND class_id IS NOT ?").all(excludeId);
  const slots = catalog.slotsByClass(rows.map((r) => r.class_id));
  return rows.map((r) => ({ ...r, slots: slots[r.class_id] || [] }));
}

function conflictsFor(target) {
  return rules.findConflicts(target, activeClassesWithSlots(target.class_id ?? null));
}

function assessedLevel(regId) {
  const a = db.get().prepare('SELECT level FROM placement_attempts WHERE registration_id = ? AND submitted_at IS NOT NULL').get(regId);
  return a ? a.level : null;
}

/** Gợi ý lớp cho hồ sơ TESTED, đã xếp hạng theo BR-06. */
function suggestions(regId) {
  const reg = db.get().prepare('SELECT * FROM registrations WHERE registration_id = ?').get(regId);
  if (!reg) throw notFound('Không tìm thấy hồ sơ.');
  const level = assessedLevel(regId);
  const classes = catalog.searchClasses({ course_id: reg.course_id, status: 'ALL' })
    .filter((c) => ['RECRUITING', 'IN_PROGRESS'].includes(c.status));
  return {
    level,
    classes: classes
      .map((c) => ({ ...c, matchScore: rules.rankSuggestion({ cls: c, slots: c.slots, enrolled: c.enrolled, studentLevel: level, registration: reg }), levelMatch: c.level === level }))
      .sort((a, b) => b.matchScore - a.matchScore),
  };
}

/** UC-07: xếp hồ sơ vào lớp. */
function enroll(regId, classId, reason, staffId) {
  return db.tx(() => {
    const d = db.get();
    const reg = d.prepare('SELECT * FROM registrations WHERE registration_id = ?').get(regId);
    if (!reg) throw notFound('Không tìm thấy hồ sơ.');
    const cls = rawClass(classId);
    const { enrolled, waiting } = counts(classId);
    const level = assessedLevel(regId);
    const decision = rules.placementDecision({ cls, enrolled, registration: reg, studentLevel: level, reason });

    if (decision.action === 'REJECT') {
      const status = ['ONLINE_FULL', 'INVALID_STATUS'].includes(decision.code) ? 409 : 422;
      throw status === 409 ? conflict(decision.code, decision.message) : unprocessable(decision.code, decision.message);
    }
    const note = cls.level !== level ? `Xếp lệch trình độ (${level} → ${cls.level}): ${reason.trim()}` : null;

    if (decision.action === 'ENROLL') {
      d.prepare(`UPDATE registrations SET class_id = ?, status = 'ENROLLED', placement_note = ?, updated_at = ${now} WHERE registration_id = ?`).run(classId, note, regId);
      return { result: 'ENROLLED', message: decision.message, class_code: cls.code, enrolled: enrolled + 1 };
    }

    // NEEDS_APPROVAL: chuyển hồ sơ chờ duyệt + lập/bổ sung tờ trình
    d.prepare(`UPDATE registrations SET class_id = ?, status = 'WAITING_APPROVAL', placement_note = ?, updated_at = ${now} WHERE registration_id = ?`).run(classId, note, regId);
    const proposal = rules.proposeResolution({ enrolled, waiting: waiting + 1, roomCapacity: cls.room_capacity, inProgress: cls.status === 'IN_PROGRESS' });
    const reasonText = `Lớp ${cls.code} đã đủ ${CAPACITY.OFFLINE.max} học viên, có ${waiting + 1} hồ sơ đề nghị xếp thêm (tổng ${proposal.total}).`;
    const pending = d.prepare("SELECT request_id FROM approval_requests WHERE class_id = ? AND status = 'PENDING'").get(classId);
    let requestId;
    if (pending) {
      d.prepare('UPDATE approval_requests SET reason = ?, proposed_action = ? WHERE request_id = ?').run(reasonText, proposal.recommended, pending.request_id);
      requestId = pending.request_id;
    } else {
      requestId = d.prepare('INSERT INTO approval_requests (class_id, reason, proposed_action) VALUES (?, ?, ?)').run(classId, reasonText, proposal.recommended).lastInsertRowid;
    }
    return { result: 'WAITING_APPROVAL', message: decision.message, request_id: Number(requestId), class_code: cls.code };
  });
}

// ---------------------------------------------------------------- Tờ trình
function listApprovals(status) {
  const rows = db.get().prepare(`
    SELECT ar.*, c.code AS class_code, c.form, c.level, c.status AS class_status, c.room_id,
           co.name AS course_name, r.name AS room_name, r.capacity AS room_capacity,
           e.enrolled, e.waiting, u.full_name AS decided_by_name, rc.code AS result_class_code
    FROM approval_requests ar
    JOIN classes c ON c.class_id = ar.class_id
    JOIN courses co ON co.course_id = c.course_id
    JOIN v_class_enrollment e ON e.class_id = c.class_id
    LEFT JOIN rooms r ON r.room_id = c.room_id
    LEFT JOIN staff_users u ON u.user_id = ar.decided_by
    LEFT JOIN classes rc ON rc.class_id = ar.result_class_id
    ${status ? 'WHERE ar.status = ?' : ''}
    ORDER BY CASE ar.status WHEN 'PENDING' THEN 0 ELSE 1 END, ar.created_at DESC`).all(...(status ? [status] : []));
  return rows.map((r) => ({
    ...r,
    proposal: r.status === 'PENDING'
      ? rules.proposeResolution({ enrolled: r.enrolled, waiting: r.waiting, roomCapacity: r.room_capacity, inProgress: r.class_status === 'IN_PROGRESS' })
      : null,
    waiting_students: r.status === 'PENDING'
      ? db.get().prepare("SELECT r.reg_code, s.full_name FROM registrations r JOIN students s ON s.student_id = r.student_id WHERE r.class_id = ? AND r.status = 'WAITING_APPROVAL' ORDER BY r.updated_at").all(r.class_id)
      : [],
  }));
}

function nextChildCode(parent) {
  const n = db.get().prepare('SELECT COUNT(*) n FROM classes WHERE parent_class_id = ?').get(parent.class_id).n + 1;
  return `${parent.code}-T${n}`;
}

/** Tìm giảng viên / phòng còn trống cho lớp mới tách (gợi ý tự động, giáo vụ có thể đổi). */
function autoArrange(base, slots, size) {
  const d = db.get();
  const others = activeClassesWithSlots();
  const target = { class_id: -1, start_date: base.start_date, end_date: base.end_date, slots };
  const teachers = d.prepare('SELECT teacher_id FROM teachers ORDER BY teacher_id').all();
  const teacherOk = (tid) => !rules.findConflicts({ ...target, teacher_id: tid, room_id: null }, others).length;
  const teacherId = [base.teacher_id, ...teachers.map((t) => t.teacher_id)].find(teacherOk) ?? base.teacher_id;
  let roomId = null;
  if (base.form === 'OFFLINE') {
    const rooms = d.prepare('SELECT room_id FROM rooms WHERE capacity >= ? ORDER BY capacity').all(Math.max(size, 1));
    const room = rooms.find((r) => !rules.findConflicts({ ...target, teacher_id: -1, room_id: r.room_id }, others).some((c) => c.type === 'ROOM'));
    roomId = room ? room.room_id : null;
  }
  return { teacherId, roomId };
}

/** UC-08: Lãnh đạo ra quyết định cho tờ trình. */
function decide(requestId, decision, note, directorId) {
  if (!['SPLIT', 'KEEP', 'REJECT'].includes(decision)) throw badRequest('Quyết định không hợp lệ.');
  return db.tx(() => {
    const d = db.get();
    const req = d.prepare('SELECT * FROM approval_requests WHERE request_id = ?').get(requestId);
    if (!req) throw notFound('Không tìm thấy tờ trình.');
    if (req.status !== 'PENDING') throw conflict('ALREADY_DECIDED', 'Tờ trình đã được xử lý.');
    const cls = rawClass(req.class_id);
    const { enrolled } = counts(cls.class_id);
    const waitingRegs = d.prepare("SELECT registration_id FROM registrations WHERE class_id = ? AND status = 'WAITING_APPROVAL' ORDER BY updated_at, registration_id").all(cls.class_id);
    const proposal = rules.proposeResolution({ enrolled, waiting: waitingRegs.length, roomCapacity: cls.room_capacity, inProgress: cls.status === 'IN_PROGRESS' });
    let resultClassId = null;
    let summary;

    if (decision === 'REJECT') {
      d.prepare(`UPDATE registrations SET class_id = NULL, status = 'TESTED', placement_note = NULL, updated_at = ${now} WHERE class_id = ? AND status = 'WAITING_APPROVAL'`).run(cls.class_id);
      summary = `Từ chối – ${waitingRegs.length} hồ sơ trở về danh sách chờ xếp lớp.`;
    } else if (decision === 'KEEP') {
      if (!proposal.options.KEEP.feasible) throw unprocessable('ROOM_TOO_SMALL', proposal.options.KEEP.note);
      d.prepare(`UPDATE registrations SET status = 'ENROLLED', updated_at = ${now} WHERE class_id = ? AND status = 'WAITING_APPROVAL'`).run(cls.class_id);
      summary = `Giữ ngoại lệ – lớp ${cls.code} có ${proposal.total} học viên.`;
    } else {
      const split = proposal.options.SPLIT;
      const slots = d.prepare('SELECT weekday, shift FROM class_schedules WHERE class_id = ?').all(cls.class_id);
      const newSizes = split.sizes.slice(1);                       // sĩ số từng lớp mới
      const totalNew = newSizes.reduce((x, y) => x + y, 0);
      const mv = d.prepare(`UPDATE registrations SET class_id = ?, status = 'ENROLLED', updated_at = ${now} WHERE registration_id = ?`);
      // Người chuyển sang lớp mới: ưu tiên hồ sơ đang chờ; nếu chia đều còn thiếu thì lấy học viên được xếp muộn nhất
      const movers = waitingRegs.slice(0, totalNew).map((r) => r.registration_id);
      for (const r of waitingRegs.slice(totalNew)) mv.run(cls.class_id, r.registration_id);
      if (movers.length < totalNew) {
        const latest = d.prepare("SELECT registration_id FROM registrations WHERE class_id = ? AND status = 'ENROLLED' ORDER BY updated_at DESC, registration_id DESC LIMIT ?").all(cls.class_id, totalNew - movers.length);
        movers.push(...latest.map((r) => r.registration_id));
      }
      const insCls = d.prepare(`INSERT INTO classes (code, course_id, level, form, start_date, end_date, teacher_id, room_id, meeting_link, status, parent_class_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECRUITING', ?)`);
      const insSlot = d.prepare('INSERT INTO class_schedules (class_id, weekday, shift) VALUES (?, ?, ?)');
      const created = [];
      let offset = 0;
      for (const size of newSizes) {
        const { teacherId, roomId } = autoArrange(cls, slots, size);   // mỗi lớp mới một giảng viên/phòng không trùng lịch
        const code = nextChildCode(cls);
        const id = Number(insCls.run(code, cls.course_id, cls.level, cls.form, cls.start_date, cls.end_date, teacherId, roomId, null, cls.class_id).lastInsertRowid);
        for (const sl of slots) insSlot.run(id, sl.weekday, sl.shift);
        for (const regId of movers.slice(offset, offset + size)) mv.run(id, regId);
        offset += size;
        created.push({ id, code, size: counts(id).enrolled });
      }
      resultClassId = created[0].id;
      const lack = created.filter((c) => c.size < CAPACITY.OFFLINE.min);
      summary = `Tách lớp – ${cls.code}: ${counts(cls.class_id).enrolled} HV; ${created.map((c) => `${c.code}: ${c.size} HV`).join('; ')}${lack.length ? ` (${lack.map((c) => `${c.code} cần tuyển thêm ${CAPACITY.OFFLINE.min - c.size} HV`).join(', ')} để mở lớp)` : ''}.`;
    }

    d.prepare(`UPDATE approval_requests SET status = ?, decision = ?, decision_note = ?, decided_by = ?, decided_at = ${now}, result_class_id = ? WHERE request_id = ?`)
      .run(decision === 'REJECT' ? 'REJECTED' : 'APPROVED', decision, (note || '').trim() || null, directorId, resultClassId, requestId);
    return { request_id: requestId, decision, summary, result_class_id: resultClassId };
  });
}

// ---------------------------------------------------------------- Lớp học (văn phòng)
function classDetail(id) {
  const cls = catalog.getClass(id);
  const students = db.get().prepare(`
    SELECT r.registration_id, r.reg_code, r.status, r.placement_note, s.full_name, s.phone, s.email, a.level AS assessed_level, a.score, a.total
    FROM registrations r JOIN students s ON s.student_id = r.student_id
    LEFT JOIN placement_attempts a ON a.registration_id = r.registration_id
    WHERE r.class_id = ? ORDER BY r.status, s.full_name`).all(id);
  const conflicts = conflictsFor({ ...cls, slots: cls.slots });
  const openCheck = rules.canOpenClass({ cls, enrolled: cls.enrolled, waiting: cls.waiting, roomCapacity: cls.room_capacity, conflicts });
  return { ...cls, students, conflicts, openCheck };
}

function validateSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0) throw badRequest('Lớp phải có ít nhất 1 buổi học/tuần.', { slots: 'Chọn ít nhất 1 buổi.' });
  for (const s of slots) {
    if (!(Number(s.weekday) >= 2 && Number(s.weekday) <= 8) || !['MORNING', 'AFTERNOON', 'EVENING'].includes(s.shift)) throw badRequest('Lịch học không hợp lệ.');
  }
  return slots.map((s) => ({ weekday: Number(s.weekday), shift: s.shift }));
}

function assertArrangement({ form, room_id, teacher_id, start_date, end_date, slots, class_id, enrolled = 0 }) {
  const d = db.get();
  if (!d.prepare('SELECT 1 FROM teachers WHERE teacher_id = ?').get(teacher_id)) throw badRequest('Giảng viên không tồn tại.');
  if (form === 'ONLINE' && room_id) throw badRequest('Lớp online không sử dụng phòng học.');
  if (room_id) {
    const room = d.prepare('SELECT * FROM rooms WHERE room_id = ?').get(room_id);
    if (!room) throw badRequest('Phòng học không tồn tại.');
    if (room.capacity < Math.max(enrolled, 1)) throw unprocessable('ROOM_TOO_SMALL', `Phòng ${room.name} chỉ chứa ${room.capacity} chỗ, lớp đang có ${enrolled} học viên.`);
  }
  const conflicts = conflictsFor({ class_id, room_id, teacher_id, start_date, end_date, slots });
  if (conflicts.length) {
    throw unprocessable('SCHEDULE_CONFLICT', 'Lịch học bị trùng phòng hoặc giảng viên.', conflicts);
  }
}

function createClass(dto) {
  const d = db.get();
  const course = d.prepare('SELECT * FROM courses WHERE course_id = ?').get(Number(dto.course_id));
  if (!course) throw badRequest('Khoá học không tồn tại.');
  if (!['ONLINE', 'OFFLINE'].includes(dto.form)) throw badRequest('Hình thức không hợp lệ.');
  if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(dto.level)) throw badRequest('Trình độ không hợp lệ.');
  if (!dto.start_date || !dto.end_date || dto.end_date <= dto.start_date) throw badRequest('Ngày kết thúc phải sau ngày khai giảng.');
  const slots = validateSlots(dto.slots);
  const roomId = dto.form === 'OFFLINE' && dto.room_id ? Number(dto.room_id) : null;
  const teacherId = Number(dto.teacher_id);
  assertArrangement({ form: dto.form, room_id: roomId, teacher_id: teacherId, start_date: dto.start_date, end_date: dto.end_date, slots, class_id: null });
  return db.tx(() => {
    const prefix = `${course.code}-${dto.level}-${dto.form === 'ONLINE' ? 'ON' : 'OFF'}-`;
    const n = d.prepare('SELECT COUNT(*) n FROM classes WHERE code LIKE ?').get(`${prefix}%`).n + 1;
    const code = `${prefix}${String(n).padStart(2, '0')}`;
    const id = Number(d.prepare(`INSERT INTO classes (code, course_id, level, form, start_date, end_date, teacher_id, room_id, meeting_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, course.course_id, dto.level, dto.form, dto.start_date, dto.end_date, teacherId, roomId,
      dto.form === 'ONLINE' ? (dto.meeting_link || `https://meet.trungtam.edu.vn/${code.toLowerCase()}`) : null).lastInsertRowid);
    const ins = d.prepare('INSERT INTO class_schedules (class_id, weekday, shift) VALUES (?, ?, ?)');
    for (const s of slots) ins.run(id, s.weekday, s.shift);
    return classDetail(id);
  });
}

/** UC-09: cập nhật lịch học / phòng / giảng viên. */
function updateArrangement(id, dto) {
  const cls = rawClass(id);
  if (!['RECRUITING', 'IN_PROGRESS'].includes(cls.status)) throw conflict('CLASS_CLOSED', 'Không thể sửa lịch lớp đã kết thúc hoặc đã huỷ.');
  const slots = validateSlots(dto.slots);
  const roomId = cls.form === 'OFFLINE' && dto.room_id ? Number(dto.room_id) : null;
  const teacherId = Number(dto.teacher_id || cls.teacher_id);
  const { enrolled } = counts(id);
  if (cls.status === 'IN_PROGRESS' && cls.form === 'OFFLINE' && !roomId) throw unprocessable('ROOM_REQUIRED', 'Lớp offline đang học bắt buộc phải có phòng.');
  assertArrangement({ form: cls.form, room_id: roomId, teacher_id: teacherId, start_date: cls.start_date, end_date: cls.end_date, slots, class_id: id, enrolled });
  db.tx(() => {
    db.get().prepare('UPDATE classes SET room_id = ?, teacher_id = ? WHERE class_id = ?').run(roomId, teacherId, id);
    db.get().prepare('DELETE FROM class_schedules WHERE class_id = ?').run(id);
    const ins = db.get().prepare('INSERT INTO class_schedules (class_id, weekday, shift) VALUES (?, ?, ?)');
    for (const s of slots) ins.run(id, s.weekday, s.shift);
  });
  return classDetail(id);
}

function openClass(id) {
  const detail = classDetail(id);
  if (!detail.openCheck.ok) throw unprocessable('CANNOT_OPEN', 'Lớp chưa đủ điều kiện mở.', detail.openCheck.reasons);
  db.get().prepare("UPDATE classes SET status = 'IN_PROGRESS' WHERE class_id = ? AND status = 'RECRUITING'").run(id);
  return classDetail(id);
}

function cancelClass(id, note) {
  const cls = rawClass(id);
  if (cls.status !== 'RECRUITING') throw conflict('CANNOT_CANCEL', 'Chỉ huỷ được lớp đang tuyển sinh.');
  return db.tx(() => {
    const d = db.get();
    const moved = d.prepare(`UPDATE registrations SET class_id = NULL, status = 'TESTED', placement_note = NULL, updated_at = ${now} WHERE class_id = ? AND status IN ('ENROLLED','WAITING_APPROVAL')`).run(id).changes;
    d.prepare(`UPDATE approval_requests SET status = 'REJECTED', decision = 'REJECT', decision_note = 'Lớp bị huỷ', decided_at = ${now} WHERE class_id = ? AND status = 'PENDING'`).run(id);
    d.prepare("UPDATE classes SET status = 'CANCELLED' WHERE class_id = ?").run(id);
    return { class_id: id, released: moved, note: note || null };
  });
}

function completeClass(id) {
  const cls = rawClass(id);
  if (cls.status !== 'IN_PROGRESS') throw conflict('INVALID_STATUS', 'Chỉ kết thúc được lớp đang học.');
  db.get().prepare("UPDATE classes SET status = 'COMPLETED' WHERE class_id = ?").run(id);
  return classDetail(id);
}

module.exports = {
  suggestions, enroll, listApprovals, decide,
  classDetail, createClass, updateArrangement, openClass, cancelClass, completeClass,
};
