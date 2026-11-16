// =====================================================================
// BUSINESS RULES ENGINE – các hàm thuần (không truy cập CSDL), dễ kiểm thử.
// Ánh xạ trực tiếp tới các quy tắc BR-01..BR-08 trong tài liệu phân tích.
// =====================================================================
const { CAPACITY, LEVELS } = require('../config');

/** Ngưỡng sĩ số theo hình thức (BR-02, BR-03). */
function limitsOf(form) {
  const lim = CAPACITY[form];
  if (!lim) throw new Error(`Hình thức không hợp lệ: ${form}`);
  return lim;
}

/**
 * Đánh giá tình trạng sĩ số của một lớp.
 * capacityState: BELOW_MIN | ELIGIBLE | FULL | OVER_CAPACITY | PENDING_APPROVAL
 */
function evaluateClass({ form, enrolled, waiting = 0 }) {
  const { min, max } = limitsOf(form);
  let capacityState;
  if (waiting > 0) capacityState = 'PENDING_APPROVAL';
  else if (enrolled > max) capacityState = 'OVER_CAPACITY';
  else if (enrolled === max) capacityState = 'FULL';
  else if (enrolled >= min) capacityState = 'ELIGIBLE';
  else capacityState = 'BELOW_MIN';

  return {
    min,
    max,
    enrolled,
    waiting,
    seatsLeft: Math.max(0, max - enrolled),
    neededToOpen: Math.max(0, min - enrolled),
    meetsMinimum: enrolled >= min,
    fillRate: Math.round((enrolled / max) * 100),
    capacityState,
  };
}

/** BR-01: chỉ hồ sơ đã thanh toán (và chưa thi) mới được làm bài kiểm tra. */
function canTakePlacement(registrationStatus) {
  if (registrationStatus === 'PENDING_PAYMENT') return { ok: false, code: 'PAYMENT_REQUIRED', message: 'Hồ sơ chưa nộp học phí – chưa thể làm bài kiểm tra đầu vào.' };
  if (registrationStatus === 'PAID') return { ok: true };
  if (registrationStatus === 'CANCELLED') return { ok: false, code: 'CANCELLED', message: 'Hồ sơ đã bị huỷ.' };
  return { ok: false, code: 'ALREADY_TESTED', message: 'Hồ sơ đã hoàn thành bài kiểm tra đầu vào.' };
}

/** Quy đổi điểm bài kiểm tra sang khung CEFR. */
function scoreToLevel(score, total) {
  if (!total) throw new Error('total phải > 0');
  const pct = (score / total) * 100;
  if (pct < 30) return 'A1';
  if (pct < 50) return 'A2';
  if (pct < 70) return 'B1';
  if (pct < 85) return 'B2';
  return 'C1';
}

/**
 * BR-04, BR-06: quyết định khi giáo vụ xếp 1 hồ sơ vào 1 lớp.
 * Trả về { action: 'ENROLL' | 'NEEDS_APPROVAL' | 'REJECT', code, message }
 */
function placementDecision({ cls, enrolled, registration, studentLevel, reason }) {
  if (registration.status !== 'TESTED') {
    return { action: 'REJECT', code: 'INVALID_STATUS', message: 'Chỉ xếp lớp cho hồ sơ đã hoàn thành bài kiểm tra đầu vào (TESTED).' };
  }
  if (cls.course_id !== registration.course_id) {
    return { action: 'REJECT', code: 'WRONG_COURSE', message: 'Lớp không thuộc khoá học mà học viên đã đăng ký và nộp học phí.' };
  }
  if (!['RECRUITING', 'IN_PROGRESS'].includes(cls.status)) {
    return { action: 'REJECT', code: 'CLASS_CLOSED', message: 'Lớp đã kết thúc hoặc đã huỷ.' };
  }
  if (studentLevel && cls.level !== studentLevel && !(reason && reason.trim().length >= 5)) {
    return { action: 'REJECT', code: 'LEVEL_MISMATCH', message: `Trình độ học viên (${studentLevel}) khác trình độ lớp (${cls.level}). Cần ghi lý do xếp lệch trình độ.` };
  }
  const { max } = limitsOf(cls.form);
  if (cls.form === 'ONLINE') {
    if (enrolled >= max) return { action: 'REJECT', code: 'ONLINE_FULL', message: `Lớp online đã đạt sĩ số tối đa ${max}.` };
    return { action: 'ENROLL', code: 'OK', message: 'Xếp lớp thành công.' };
  }
  if (enrolled >= max) {
    return { action: 'NEEDS_APPROVAL', code: 'OVER_30', message: `Lớp offline đã đủ ${max} học viên – hồ sơ được chuyển chờ Lãnh đạo trung tâm phê duyệt.` };
  }
  return { action: 'ENROLL', code: 'OK', message: 'Xếp lớp thành công.' };
}

/**
 * BR-04: phương án xử lý tờ trình vượt sĩ số lớp Offline.
 * - Tách lớp: nếu tổng ≥ 2×min (40) thì chia đều để cả 2 lớp đủ điều kiện mở;
 *             ngược lại tách phần dư sang lớp mới (lớp mới tiếp tục tuyển sinh).
 * - Giữ ngoại lệ: chỉ khả thi khi phòng hiện tại đủ chỗ (hoặc chưa gán phòng).
 */
function proposeResolution({ enrolled, waiting, roomCapacity = null, inProgress = false }) {
  const { min, max } = CAPACITY.OFFLINE;
  const total = enrolled + waiting;
  // Lớp đang học thì không xáo trộn học viên cũ: chỉ tách phần dư.
  const even = !inProgress && total >= 2 * min;
  let split;
  if (even) {
    // Số lớp ít nhất để không lớp nào vượt 30; với tổng >= 40 mọi lớp sau khi chia đều >= 20.
    const sizes = balanced(total, Math.max(2, Math.ceil(total / max)));
    split = { feasible: true, mode: 'EVEN', sizes, note: `Chia đều ${total} học viên thành ${sizes.length} lớp ${sizes.join(' + ')}, tất cả đều đủ điều kiện mở (≥ ${min}).` };
  } else {
    const extra = balanced(waiting, Math.max(1, Math.ceil(waiting / max)));
    const need = extra.map((n) => Math.max(0, min - n)).filter(Boolean);
    split = { feasible: true, mode: 'REMAINDER', sizes: [enrolled, ...extra], note: `Giữ ${enrolled} học viên ở lớp cũ, chuyển ${waiting} học viên sang ${extra.length > 1 ? extra.length + ' lớp mới' : 'lớp mới'}${need.length ? `; lớp mới cần tuyển thêm ${need.join(', ')} học viên để đủ điều kiện mở` : ''}.` };
  }
  const keepFeasible = roomCapacity == null || roomCapacity >= total;
  const keep = {
    feasible: keepFeasible,
    note: keepFeasible
      ? `Giữ nguyên lớp với ${total} học viên (vượt chuẩn ${total - max}).`
      : `Không khả thi: phòng hiện tại chỉ chứa ${roomCapacity} chỗ < ${total}.`,
  };
  const recommended = even || !keepFeasible ? 'SPLIT' : 'KEEP';
  return { total, recommended, options: { SPLIT: split, KEEP: keep, REJECT: { feasible: true, note: 'Từ chối: hồ sơ chờ trở về trạng thái chưa xếp lớp để xếp lớp/ca khác.' } } };
}

/** Chia total thành k phần chênh nhau không quá 1 (phần lớn hơn đứng trước). */
function balanced(total, k) {
  const base = Math.floor(total / k);
  return Array.from({ length: k }, (_, i) => base + (i < total % k ? 1 : 0));
}

/** Kiểm tra 2 khoảng ngày [a1,a2] và [b1,b2] có giao nhau không (chuỗi ISO yyyy-mm-dd). */
function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * BR-05: tìm xung đột phòng / giảng viên.
 * target: { class_id, room_id, teacher_id, start_date, end_date, slots: [{weekday, shift}] }
 * others: danh sách lớp khác (đang tuyển sinh / đang học) cùng cấu trúc.
 */
function findConflicts(target, others) {
  const conflicts = [];
  for (const o of others) {
    if (o.class_id === target.class_id) continue;
    if (!datesOverlap(target.start_date, target.end_date, o.start_date, o.end_date)) continue;
    for (const s of target.slots) {
      const clash = o.slots.some((x) => x.weekday === s.weekday && x.shift === s.shift);
      if (!clash) continue;
      if (target.room_id && o.room_id === target.room_id) conflicts.push({ type: 'ROOM', classCode: o.code, weekday: s.weekday, shift: s.shift });
      if (o.teacher_id === target.teacher_id) conflicts.push({ type: 'TEACHER', classCode: o.code, weekday: s.weekday, shift: s.shift });
    }
  }
  return conflicts;
}

/** BR-05, BR-08: điều kiện chuyển lớp từ RECRUITING sang IN_PROGRESS. */
function canOpenClass({ cls, enrolled, waiting, roomCapacity, conflicts = [] }) {
  const reasons = [];
  const { min } = limitsOf(cls.form);
  if (cls.status !== 'RECRUITING') reasons.push('Lớp không ở trạng thái tuyển sinh.');
  if (enrolled < min) reasons.push(`Sĩ số ${enrolled} chưa đạt ngưỡng tối thiểu ${min} của lớp ${cls.form === 'ONLINE' ? 'online' : 'offline'}.`);
  if (waiting > 0) reasons.push('Còn tờ trình vượt sĩ số chưa được Lãnh đạo phê duyệt.');
  if (cls.form === 'OFFLINE') {
    if (!cls.room_id) reasons.push('Lớp offline chưa được phân phòng học.');
    else if (roomCapacity != null && roomCapacity < enrolled) reasons.push(`Phòng chỉ có ${roomCapacity} chỗ, không đủ cho ${enrolled} học viên.`);
  }
  if (conflicts.length) reasons.push(`Lịch học bị trùng (${conflicts.map((c) => `${c.type === 'ROOM' ? 'phòng' : 'giảng viên'} với lớp ${c.classCode}`).join('; ')}).`);
  return { ok: reasons.length === 0, reasons };
}

/** Xếp hạng lớp gợi ý cho 1 hồ sơ (BR-06): đúng trình độ > đúng lớp mong muốn > hình thức > ca > còn chỗ. */
function rankSuggestion({ cls, slots, enrolled, studentLevel, registration }) {
  let score = 0;
  if (cls.level === studentLevel) score += 100;
  else score -= 20 * Math.abs(LEVELS.indexOf(cls.level) - LEVELS.indexOf(studentLevel));
  if (cls.status === 'IN_PROGRESS') score -= 60; // lớp đã khai giảng: chỉ là phương án học bù / vào muộn
  if (registration.desired_class_id === cls.class_id) score += 40;
  if (cls.form === registration.desired_form) score += 30;
  if (slots.some((s) => s.shift === registration.desired_shift)) score += 15;
  const { max } = limitsOf(cls.form);
  if (enrolled < max) score += 10;
  return score;
}

const PHONE_RE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Kiểm tra hợp lệ dữ liệu form đăng ký (dùng chung server – client). */
function validateRegistration(dto, today = new Date()) {
  const errors = {};
  const name = (dto.full_name || '').trim();
  if (name.length < 4 || name.split(/\s+/).length < 2) errors.full_name = 'Vui lòng nhập đầy đủ họ và tên.';
  if (!PHONE_RE.test((dto.phone || '').replace(/[\s.]/g, ''))) errors.phone = 'Số điện thoại di động Việt Nam không hợp lệ.';
  if (!EMAIL_RE.test((dto.email || '').trim())) errors.email = 'Email không hợp lệ.';
  if (dto.dob) {
    const d = new Date(dto.dob);
    const age = (today - d) / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(d.getTime()) || age < 10 || age > 70) errors.dob = 'Ngày sinh không hợp lệ (độ tuổi 10 – 70).';
  }
  if (!Number.isInteger(Number(dto.course_id)) || Number(dto.course_id) <= 0) errors.course_id = 'Vui lòng chọn khoá học.';
  if (!['ONLINE', 'OFFLINE'].includes(dto.desired_form)) errors.desired_form = 'Vui lòng chọn hình thức học.';
  if (!['MORNING', 'AFTERNOON', 'EVENING'].includes(dto.desired_shift)) errors.desired_shift = 'Vui lòng chọn ca học.';
  if (dto.note && dto.note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự.';
  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = {
  limitsOf,
  evaluateClass,
  canTakePlacement,
  scoreToLevel,
  placementDecision,
  proposeResolution,
  datesOverlap,
  findConflicts,
  canOpenClass,
  rankSuggestion,
  validateRegistration,
  PHONE_RE,
  EMAIL_RE,
};
