// Chức năng 1 (Quảng bá lớp học) + Chức năng 3 (Tra cứu danh sách lớp)
const db = require('../db/connection');
const rules = require('../domain/rules');
const { notFound } = require('./errors');

const CLASS_SELECT = `
  SELECT c.*, co.code AS course_code, co.name AS course_name, co.certificate, co.target, co.tuition_fee, co.total_hours,
         t.full_name AS teacher_name, t.title AS teacher_title,
         r.name AS room_name, r.campus, r.capacity AS room_capacity,
         e.enrolled, e.waiting,
         (SELECT request_id FROM approval_requests ar WHERE ar.class_id = c.class_id AND ar.status = 'PENDING') AS pending_request_id
  FROM classes c
  JOIN courses co ON co.course_id = c.course_id
  JOIN teachers t ON t.teacher_id = c.teacher_id
  LEFT JOIN rooms r ON r.room_id = c.room_id
  JOIN v_class_enrollment e ON e.class_id = c.class_id`;

function slotsByClass(classIds) {
  if (!classIds.length) return {};
  const rows = db.get().prepare(
    `SELECT class_id, weekday, shift FROM class_schedules WHERE class_id IN (${classIds.map(() => '?').join(',')}) ORDER BY weekday`
  ).all(...classIds);
  const map = {};
  for (const r of rows) (map[r.class_id] ||= []).push({ weekday: r.weekday, shift: r.shift });
  return map;
}

/** Gắn lịch học + đánh giá sĩ số cho danh sách lớp. */
function decorate(rows) {
  const slots = slotsByClass(rows.map((r) => r.class_id));
  return rows.map((r) => ({
    ...r,
    slots: slots[r.class_id] || [],
    capacity: rules.evaluateClass({ form: r.form, enrolled: r.enrolled, waiting: r.waiting }),
  }));
}

function listCourses() {
  const courses = db.get().prepare(`
    SELECT co.*,
      (SELECT COUNT(*) FROM classes c WHERE c.course_id = co.course_id AND c.status = 'RECRUITING') AS open_classes,
      (SELECT COUNT(*) FROM classes c WHERE c.course_id = co.course_id AND c.status = 'RECRUITING' AND c.form = 'ONLINE') AS online_classes,
      (SELECT COUNT(*) FROM classes c WHERE c.course_id = co.course_id AND c.status = 'RECRUITING' AND c.form = 'OFFLINE') AS offline_classes,
      (SELECT MIN(start_date) FROM classes c WHERE c.course_id = co.course_id AND c.status = 'RECRUITING') AS next_start
    FROM courses co WHERE co.is_published = 1 ORDER BY co.certificate, co.tuition_fee`).all();
  return courses.map(parseCourse);
}

function parseCourse(c) {
  return { ...c, syllabus: JSON.parse(c.syllabus), outcomes: c.outcomes.split('\n').filter(Boolean) };
}

function getCourse(id) {
  const c = db.get().prepare('SELECT * FROM courses WHERE course_id = ? AND is_published = 1').get(id);
  if (!c) throw notFound('Không tìm thấy khoá học.');
  const classes = decorate(db.get().prepare(`${CLASS_SELECT} WHERE c.course_id = ? AND c.status IN ('RECRUITING','IN_PROGRESS') ORDER BY c.status DESC, c.start_date`).all(id));
  return { ...parseCourse(c), classes };
}

/**
 * Tra cứu lớp với bộ lọc tuỳ chọn. Mọi tham số đều được truyền qua placeholder (chống SQL injection).
 * filters: q, certificate, course_id, form, shift, level, from, to, available, status
 */
function searchClasses(filters = {}) {
  const where = [];
  const params = [];
  const status = filters.status === 'ALL' ? null : (filters.status || 'RECRUITING');
  if (status) { where.push('c.status = ?'); params.push(status); }
  if (filters.q) {
    where.push('(c.code LIKE ? OR co.name LIKE ? OR t.full_name LIKE ? OR co.certificate LIKE ?)');
    const like = `%${String(filters.q).trim()}%`;
    params.push(like, like, like, like);
  }
  if (filters.certificate) { where.push('co.certificate = ?'); params.push(filters.certificate); }
  if (filters.course_id) { where.push('c.course_id = ?'); params.push(Number(filters.course_id)); }
  if (filters.form) { where.push('c.form = ?'); params.push(filters.form); }
  if (filters.level) { where.push('c.level = ?'); params.push(filters.level); }
  if (filters.from) { where.push('c.start_date >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('c.start_date <= ?'); params.push(filters.to); }
  if (filters.shift) {
    where.push('EXISTS (SELECT 1 FROM class_schedules s WHERE s.class_id = c.class_id AND s.shift = ?)');
    params.push(filters.shift);
  }
  const sql = `${CLASS_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.start_date, c.code`;
  let rows = decorate(db.get().prepare(sql).all(...params));
  if (filters.available === '1' || filters.available === true) {
    rows = rows.filter((r) => r.capacity.seatsLeft > 0 && r.capacity.waiting === 0);
  }
  return rows;
}

function getClass(id) {
  const row = db.get().prepare(`${CLASS_SELECT} WHERE c.class_id = ?`).get(id);
  if (!row) throw notFound('Không tìm thấy lớp học.');
  return decorate([row])[0];
}

function publicStats() {
  const d = db.get();
  return {
    courses: d.prepare('SELECT COUNT(*) n FROM courses WHERE is_published = 1').get().n,
    recruiting: d.prepare("SELECT COUNT(*) n FROM classes WHERE status = 'RECRUITING'").get().n,
    students: d.prepare("SELECT COUNT(DISTINCT student_id) n FROM registrations WHERE status <> 'CANCELLED'").get().n,
    teachers: d.prepare('SELECT COUNT(*) n FROM teachers').get().n,
  };
}

module.exports = { listCourses, getCourse, searchClasses, getClass, decorate, slotsByClass, CLASS_SELECT, publicStats };
