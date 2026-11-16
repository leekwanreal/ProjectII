// Số liệu cho Dashboard quản trị
const db = require('../db/connection');
const catalog = require('./catalog');

function lastMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function dashboard() {
  const d = db.get();
  const one = (sql, ...p) => d.prepare(sql).get(...p);
  const months = lastMonths(6);
  const thisMonth = months[months.length - 1];

  const revRows = d.prepare("SELECT strftime('%Y-%m', paid_at) m, SUM(amount) total, COUNT(*) n FROM payments GROUP BY m").all();
  const regRows = d.prepare("SELECT strftime('%Y-%m', created_at) m, COUNT(*) n FROM registrations GROUP BY m").all();
  const rev = Object.fromEntries(revRows.map((r) => [r.m, r.total]));
  const regs = Object.fromEntries(regRows.map((r) => [r.m, r.n]));

  const statusCounts = Object.fromEntries(d.prepare('SELECT status, COUNT(*) n FROM registrations GROUP BY status').all().map((r) => [r.status, r.n]));
  const sc = (k) => statusCounts[k] || 0;

  const recruiting = catalog.searchClasses({ status: 'RECRUITING' });
  const inProgress = catalog.searchClasses({ status: 'IN_PROGRESS' });
  const capacityStates = {};
  for (const c of recruiting) capacityStates[c.capacity.capacityState] = (capacityStates[c.capacity.capacityState] || 0) + 1;

  return {
    kpis: {
      revenueTotal: one('SELECT COALESCE(SUM(amount),0) v FROM payments').v,
      revenueMonth: rev[thisMonth] || 0,
      revenuePrevMonth: rev[months[months.length - 2]] || 0,
      registrations: one("SELECT COUNT(*) v FROM registrations WHERE status <> 'CANCELLED'").v,
      registrationsMonth: regs[thisMonth] || 0,
      students: one('SELECT COUNT(*) v FROM students').v,
      recruitingClasses: recruiting.length,
      inProgressClasses: inProgress.length,
      pendingApprovals: one("SELECT COUNT(*) v FROM approval_requests WHERE status = 'PENDING'").v,
      waitingChats: one("SELECT COUNT(*) v FROM chat_sessions WHERE status = 'WAITING'").v,
      toPlace: sc('TESTED'),
      pendingPayment: sc('PENDING_PAYMENT'),
      readyToOpen: recruiting.filter((c) => c.capacity.meetsMinimum && c.capacity.waiting === 0).length,
    },
    months,
    revenueByMonth: months.map((m) => rev[m] || 0),
    registrationsByMonth: months.map((m) => regs[m] || 0),
    funnel: [
      { label: 'Đăng ký', value: sc('PENDING_PAYMENT') + sc('PAID') + sc('TESTED') + sc('WAITING_APPROVAL') + sc('ENROLLED') },
      { label: 'Đã nộp học phí', value: sc('PAID') + sc('TESTED') + sc('WAITING_APPROVAL') + sc('ENROLLED') },
      { label: 'Đã kiểm tra đầu vào', value: sc('TESTED') + sc('WAITING_APPROVAL') + sc('ENROLLED') },
      { label: 'Đã xếp lớp', value: sc('ENROLLED') },
    ],
    statusCounts,
    byCertificate: d.prepare(`SELECT co.certificate, COUNT(r.registration_id) registrations, COALESCE(SUM(p.amount),0) revenue
      FROM courses co LEFT JOIN registrations r ON r.course_id = co.course_id AND r.status <> 'CANCELLED'
      LEFT JOIN payments p ON p.registration_id = r.registration_id
      GROUP BY co.certificate ORDER BY registrations DESC`).all(),
    levels: d.prepare('SELECT level, COUNT(*) n FROM placement_attempts WHERE level IS NOT NULL GROUP BY level ORDER BY level').all(),
    paymentMethods: d.prepare('SELECT method, COUNT(*) n, SUM(amount) total FROM payments GROUP BY method ORDER BY n DESC').all(),
    capacityStates,
    classCapacity: recruiting.map((c) => ({
      class_id: c.class_id, code: c.code, form: c.form, enrolled: c.enrolled, waiting: c.waiting,
      min: c.capacity.min, max: c.capacity.max, state: c.capacity.capacityState, start_date: c.start_date,
    })),
    recentRegistrations: d.prepare(`SELECT r.reg_code, r.status, r.created_at, s.full_name, co.name course_name
      FROM registrations r JOIN students s ON s.student_id = r.student_id JOIN courses co ON co.course_id = r.course_id
      ORDER BY r.registration_id DESC LIMIT 6`).all(),
  };
}

module.exports = { dashboard };
