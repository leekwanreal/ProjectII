// Kiểm thử đơn vị Business Rules (BR-01..BR-08), tập trung vào giá trị biên.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../server/domain/rules');

describe('BR-02/BR-03 – đánh giá sĩ số', () => {
  test('Online: 9 học viên chưa đủ, 10 học viên đủ điều kiện mở', () => {
    assert.equal(R.evaluateClass({ form: 'ONLINE', enrolled: 9 }).capacityState, 'BELOW_MIN');
    assert.equal(R.evaluateClass({ form: 'ONLINE', enrolled: 9 }).neededToOpen, 1);
    assert.equal(R.evaluateClass({ form: 'ONLINE', enrolled: 10 }).capacityState, 'ELIGIBLE');
  });
  test('Offline: 19 chưa đủ, 20 đủ, 30 đầy, 31 vượt', () => {
    assert.equal(R.evaluateClass({ form: 'OFFLINE', enrolled: 19 }).capacityState, 'BELOW_MIN');
    assert.equal(R.evaluateClass({ form: 'OFFLINE', enrolled: 20 }).capacityState, 'ELIGIBLE');
    assert.equal(R.evaluateClass({ form: 'OFFLINE', enrolled: 30 }).capacityState, 'FULL');
    assert.equal(R.evaluateClass({ form: 'OFFLINE', enrolled: 31 }).capacityState, 'OVER_CAPACITY');
  });
  test('Có hồ sơ chờ duyệt thì trạng thái là PENDING_APPROVAL', () => {
    assert.equal(R.evaluateClass({ form: 'OFFLINE', enrolled: 30, waiting: 2 }).capacityState, 'PENDING_APPROVAL');
  });
});

describe('BR-01 – điều kiện làm bài kiểm tra đầu vào', () => {
  test('Chưa nộp học phí bị chặn', () => assert.equal(R.canTakePlacement('PENDING_PAYMENT').code, 'PAYMENT_REQUIRED'));
  test('Đã nộp học phí được thi', () => assert.equal(R.canTakePlacement('PAID').ok, true));
  test('Đã thi không được thi lại', () => assert.equal(R.canTakePlacement('TESTED').code, 'ALREADY_TESTED'));
});

describe('Quy đổi điểm sang CEFR', () => {
  const cases = [[5, 'A1'], [6, 'A2'], [9, 'A2'], [10, 'B1'], [13, 'B1'], [14, 'B2'], [16, 'B2'], [17, 'C1'], [20, 'C1']];
  for (const [score, level] of cases) test(`${score}/20 → ${level}`, () => assert.equal(R.scoreToLevel(score, 20), level));
});

describe('BR-04/BR-06 – quyết định xếp lớp', () => {
  const reg = { status: 'TESTED', course_id: 1 };
  const off = { course_id: 1, form: 'OFFLINE', level: 'B1', status: 'RECRUITING' };
  const on = { ...off, form: 'ONLINE' };
  test('Offline 29 học viên → xếp được (học viên thứ 30)', () => {
    assert.equal(R.placementDecision({ cls: off, enrolled: 29, registration: reg, studentLevel: 'B1' }).action, 'ENROLL');
  });
  test('Offline 30 học viên → cần Lãnh đạo phê duyệt (học viên thứ 31)', () => {
    assert.equal(R.placementDecision({ cls: off, enrolled: 30, registration: reg, studentLevel: 'B1' }).action, 'NEEDS_APPROVAL');
  });
  test('Online đầy (40) → từ chối, không lập tờ trình', () => {
    const d = R.placementDecision({ cls: on, enrolled: 40, registration: reg, studentLevel: 'B1' });
    assert.equal(d.action, 'REJECT');
    assert.equal(d.code, 'ONLINE_FULL');
  });
  test('Sai khoá học → từ chối', () => {
    assert.equal(R.placementDecision({ cls: { ...off, course_id: 2 }, enrolled: 0, registration: reg, studentLevel: 'B1' }).code, 'WRONG_COURSE');
  });
  test('Lệch trình độ không có lý do → từ chối; có lý do → xếp được', () => {
    assert.equal(R.placementDecision({ cls: off, enrolled: 5, registration: reg, studentLevel: 'A2' }).code, 'LEVEL_MISMATCH');
    assert.equal(R.placementDecision({ cls: off, enrolled: 5, registration: reg, studentLevel: 'A2', reason: 'Học viên xin học vượt cấp' }).action, 'ENROLL');
  });
  test('Hồ sơ chưa thi → từ chối', () => {
    assert.equal(R.placementDecision({ cls: off, enrolled: 5, registration: { ...reg, status: 'PAID' }, studentLevel: null }).code, 'INVALID_STATUS');
  });
});

describe('BR-04 – phương án xử lý tờ trình', () => {
  test('30 + 3 = 33 < 40, phòng 40 chỗ → đề xuất giữ ngoại lệ, tách phần dư', () => {
    const p = R.proposeResolution({ enrolled: 30, waiting: 3, roomCapacity: 40 });
    assert.equal(p.recommended, 'KEEP');
    assert.equal(p.options.SPLIT.mode, 'REMAINDER');
    assert.deepEqual(p.options.SPLIT.sizes, [30, 3]);
  });
  test('30 + 3 nhưng phòng chỉ 30 chỗ → không giữ được, đề xuất tách', () => {
    const p = R.proposeResolution({ enrolled: 30, waiting: 3, roomCapacity: 30 });
    assert.equal(p.options.KEEP.feasible, false);
    assert.equal(p.recommended, 'SPLIT');
  });
  test('30 + 10 = 40 → chia đều 20/20 (cả 2 lớp đủ điều kiện mở)', () => {
    const p = R.proposeResolution({ enrolled: 30, waiting: 10, roomCapacity: 45 });
    assert.equal(p.options.SPLIT.mode, 'EVEN');
    assert.deepEqual(p.options.SPLIT.sizes, [20, 20]);
    assert.equal(p.recommended, 'SPLIT');
  });
  test('30 + 9 = 39 → chưa chia đều được', () => {
    assert.equal(R.proposeResolution({ enrolled: 30, waiting: 9 }).options.SPLIT.mode, 'REMAINDER');
  });
  test('Lớp đang học → chỉ tách phần dư', () => {
    assert.equal(R.proposeResolution({ enrolled: 30, waiting: 12, inProgress: true }).options.SPLIT.mode, 'REMAINDER');
  });
});

describe('BR-05/BR-08 – lịch học, phòng học, mở lớp', () => {
  const base = { class_id: 1, code: 'A', room_id: 1, teacher_id: 1, start_date: '2026-12-01', end_date: '2027-02-01', slots: [{ weekday: 2, shift: 'EVENING' }] };
  test('Trùng phòng cùng thứ – ca – thời gian', () => {
    const c = R.findConflicts(base, [{ ...base, class_id: 2, code: 'B', teacher_id: 9 }]);
    assert.deepEqual(c.map((x) => x.type), ['ROOM']);
  });
  test('Trùng giảng viên', () => {
    const c = R.findConflicts(base, [{ ...base, class_id: 2, code: 'B', room_id: 7 }]);
    assert.deepEqual(c.map((x) => x.type), ['TEACHER']);
  });
  test('Khác ca hoặc không giao thời gian → không trùng', () => {
    assert.equal(R.findConflicts(base, [{ ...base, class_id: 2, slots: [{ weekday: 2, shift: 'MORNING' }] }]).length, 0);
    assert.equal(R.findConflicts(base, [{ ...base, class_id: 2, start_date: '2027-03-01', end_date: '2027-05-01' }]).length, 0);
  });
  test('Không mở được lớp offline thiếu phòng hoặc thiếu sĩ số', () => {
    const cls = { form: 'OFFLINE', status: 'RECRUITING', room_id: null };
    const r1 = R.canOpenClass({ cls, enrolled: 19, waiting: 0 });
    assert.equal(r1.ok, false);
    assert.equal(r1.reasons.length, 2);
    assert.equal(R.canOpenClass({ cls: { ...cls, room_id: 3 }, enrolled: 20, waiting: 0, roomCapacity: 30 }).ok, true);
  });
  test('Không mở được khi còn tờ trình chờ duyệt', () => {
    assert.equal(R.canOpenClass({ cls: { form: 'OFFLINE', status: 'RECRUITING', room_id: 1 }, enrolled: 30, waiting: 1, roomCapacity: 40 }).ok, false);
  });
  test('Lớp online 10 học viên mở được, không cần phòng', () => {
    assert.equal(R.canOpenClass({ cls: { form: 'ONLINE', status: 'RECRUITING', room_id: null }, enrolled: 10, waiting: 0 }).ok, true);
  });
});

describe('Kiểm tra hợp lệ form đăng ký', () => {
  const ok = { full_name: 'Nguyễn Lê Quân', phone: '0912 345 678', email: 'quan@example.com', course_id: 1, desired_form: 'ONLINE', desired_shift: 'EVENING' };
  test('Dữ liệu đúng', () => assert.equal(R.validateRegistration(ok).valid, true));
  test('SĐT sai đầu số', () => assert.ok(R.validateRegistration({ ...ok, phone: '0212345678' }).errors.phone));
  test('Thiếu họ tên đầy đủ', () => assert.ok(R.validateRegistration({ ...ok, full_name: 'Quân' }).errors.full_name));
  test('Email sai', () => assert.ok(R.validateRegistration({ ...ok, email: 'quan@' }).errors.email));
});
