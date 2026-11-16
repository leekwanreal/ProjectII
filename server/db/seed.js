// Dữ liệu mẫu (xác định – deterministic) phủ đầy đủ các trạng thái nghiệp vụ để demo.
// Chạy: npm run seed  (xoá CSDL cũ và tạo lại)
const fs = require('fs');
const config = require('../config');
const db = require('./connection');
const { hashPassword } = require('../services/auth');
const QUESTIONS = require('./questions');

// ---------------------------------------------------------------- tiện ích
function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20235199);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);
const atHour = (d) => { const x = new Date(d); x.setHours(between(8, 21), between(0, 59), between(0, 59)); return x; };

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Trịnh'];
const DEM = ['Văn', 'Thị', 'Minh', 'Thu', 'Đức', 'Ngọc', 'Hoàng', 'Thanh', 'Quang', 'Hải', 'Phương', 'Gia', 'Bảo', 'Khánh', 'Tuấn', 'Thùy', 'Anh'];
const TEN = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hiếu', 'Hùng', 'Huyền', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Ngân', 'Nhung', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Trung', 'Tú', 'Vy', 'Yến', 'Đạt', 'Hưng', 'Minh'];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, '.');

// ---------------------------------------------------------------- danh mục
const COURSES = [
  { code: 'IELTS-F', name: 'IELTS Foundation', certificate: 'IELTS', target: '4.5 – 5.0', hours: 60, fee: 6500000,
    description: 'Xây nền tảng ngữ pháp, từ vựng học thuật và làm quen 4 kỹ năng theo định dạng đề IELTS cho người mới bắt đầu.',
    outcomes: ['Đạt band 4.5 – 5.0 IELTS', 'Nắm vững 12 thì và cấu trúc câu phức', 'Viết được đoạn văn mô tả biểu đồ đơn giản'],
    syllabus: [['Tuần 1–4', 'Ngữ pháp nền tảng, phát âm IPA'], ['Tuần 5–8', 'Listening & Reading dạng cơ bản'], ['Tuần 9–12', 'Writing Task 1, Speaking Part 1 – 2, thi thử']] },
  { code: 'IELTS-I', name: 'IELTS Intermediate', certificate: 'IELTS', target: '6.0 – 6.5', hours: 72, fee: 8900000,
    description: 'Chiến lược làm bài 4 kỹ năng, phát triển ý tưởng Writing Task 2 và phản xạ Speaking. Phù hợp sinh viên cần chuẩn đầu ra.',
    outcomes: ['Đạt band 6.0 – 6.5 IELTS', 'Viết bài luận 250 từ đủ 4 tiêu chí chấm', 'Trả lời Speaking Part 3 mạch lạc'],
    syllabus: [['Tuần 1–4', 'Reading skimming/scanning, Listening Section 3 – 4'], ['Tuần 5–8', 'Writing Task 2: 5 dạng bài'], ['Tuần 9–12', 'Speaking chuyên sâu, 3 bài thi thử có chữa']] },
  { code: 'IELTS-A', name: 'IELTS Advanced 7.0+', certificate: 'IELTS', target: '7.0+', hours: 80, fee: 11500000,
    description: 'Lớp chuyên sâu cho mục tiêu du học, học bổng: từ vựng học thuật nâng cao, lập luận phản biện, luyện đề sát thi thật.',
    outcomes: ['Đạt band 7.0 trở lên', 'Sử dụng linh hoạt cấu trúc nâng cao', 'Tự chữa bài viết theo band descriptors'],
    syllabus: [['Tuần 1–4', 'Academic vocabulary & collocations'], ['Tuần 5–8', 'Critical writing, coherence & cohesion'], ['Tuần 9–12', 'Mock test hàng tuần, phản hồi 1 – 1']] },
  { code: 'TOEIC-LR', name: 'TOEIC Listening & Reading 650+', certificate: 'TOEIC', target: '650+', hours: 48, fee: 4800000,
    description: 'Luyện 7 phần thi TOEIC L&R, mẹo bẫy đề và từ vựng công sở. Đáp ứng chuẩn đầu ra tiếng Anh của nhiều trường đại học.',
    outcomes: ['Đạt 650+ TOEIC L&R', 'Thành thạo 600 từ vựng chủ đề công sở', 'Hoàn thành đề 200 câu trong 120 phút'],
    syllabus: [['Tuần 1–3', 'Part 1 – 4: Listening'], ['Tuần 4–6', 'Part 5 – 7: Reading'], ['Tuần 7–8', 'Luyện đề full test']] },
  { code: 'TOEIC-SW', name: 'TOEIC Speaking & Writing', certificate: 'TOEIC', target: '300+ / 400', hours: 36, fee: 4200000,
    description: 'Luyện nói và viết theo 19 câu hỏi của bài thi TOEIC S&W, phù hợp người đi làm cần chứng chỉ 4 kỹ năng.',
    outcomes: ['Đạt 300+ / 400 TOEIC S&W', 'Viết email công việc chuẩn mực', 'Trình bày ý kiến trong 60 giây'],
    syllabus: [['Tuần 1–3', 'Speaking Q1 – Q11'], ['Tuần 4–6', 'Writing Q1 – Q8, thi thử']] },
  { code: 'VSTEP-B1', name: 'VSTEP Bậc 3 (B1)', certificate: 'VSTEP', target: 'Bậc 3/6 (B1)', hours: 45, fee: 3900000,
    description: 'Ôn thi chứng chỉ tiếng Anh theo Khung năng lực ngoại ngữ 6 bậc dùng cho Việt Nam – chuẩn đầu ra đại học, tuyển dụng công chức.',
    outcomes: ['Đạt VSTEP bậc 3 (B1)', 'Nắm cấu trúc đề 4 kỹ năng VSTEP', 'Viết thư và bài luận ngắn đúng yêu cầu'],
    syllabus: [['Tuần 1–3', 'Nghe – Đọc theo định dạng VSTEP'], ['Tuần 4–6', 'Viết thư, bài luận; Nói 3 phần'], ['Tuần 7–8', 'Thi thử có chấm điểm']] },
  { code: 'VSTEP-B2', name: 'VSTEP Bậc 4 (B2)', certificate: 'VSTEP', target: 'Bậc 4/6 (B2)', hours: 60, fee: 5500000,
    description: 'Dành cho học viên cao học, giảng viên, giáo viên cần chứng chỉ bậc 4 theo chuẩn quốc gia.',
    outcomes: ['Đạt VSTEP bậc 4 (B2)', 'Đọc hiểu văn bản học thuật dài', 'Lập luận nói/viết chặt chẽ'],
    syllabus: [['Tuần 1–4', 'Kỹ năng đọc – nghe nâng cao'], ['Tuần 5–8', 'Viết luận nghị luận, thảo luận nhóm'], ['Tuần 9–10', 'Thi thử']] },
  { code: 'CAM-B2', name: 'Cambridge B2 First (FCE)', certificate: 'CAMBRIDGE', target: 'B2 First – Grade B', hours: 90, fee: 12000000,
    description: 'Chương trình chuẩn Cambridge English cho học sinh THPT và sinh viên, chứng chỉ không thời hạn.',
    outcomes: ['Đạt B2 First (160 – 179)', 'Hoàn thành 7 phần Reading & Use of English', 'Giao tiếp tự tin trong thảo luận cặp'],
    syllabus: [['Tuần 1–5', 'Use of English & Reading'], ['Tuần 6–10', 'Writing essay/article/review'], ['Tuần 11–15', 'Listening, Speaking, mock test']] },
];

const TEACHERS = [
  ['ThS. Đỗ Minh Khang', 'Thạc sĩ TESOL', 'IELTS Writing & Speaking'],
  ['ThS. Phạm Lan Anh', 'Thạc sĩ Ngôn ngữ Anh', 'IELTS nền tảng'],
  ['Mr. Daniel Brooks', 'CELTA, 8 năm kinh nghiệm', 'TOEIC & Business English'],
  ['TS. Vũ Hải Đăng', 'Tiến sĩ Ngôn ngữ học', 'IELTS học thuật nâng cao'],
  ['ThS. Ngô Thanh Hương', 'Thạc sĩ Lý luận & PPGD tiếng Anh', 'VSTEP'],
  ['Ms. Emily Carter', 'DELTA', 'Speaking & Pronunciation'],
  ['ThS. Lê Quốc Bảo', 'Thạc sĩ TESOL', 'Cambridge & học thuật'],
  ['ThS. Trịnh Mai Phương', 'Thạc sĩ Ngôn ngữ Anh', 'TOEIC Speaking & Writing'],
];

const ROOMS = [
  ['P.101', 'Cơ sở Bách Khoa – Tạ Quang Bửu', 35],
  ['P.102', 'Cơ sở Bách Khoa – Tạ Quang Bửu', 30],
  ['P.201', 'Cơ sở Bách Khoa – Tạ Quang Bửu', 40],
  ['P.202', 'Cơ sở Bách Khoa – Tạ Quang Bửu', 25],
  ['P.301', 'Cơ sở Cầu Giấy', 32],
  ['P.302', 'Cơ sở Cầu Giấy', 30],
  ['Hội trường A', 'Cơ sở Cầu Giấy', 45],
];

const STAFF = [
  ['tuvan1', 'Phạm Thu Trang', 'CONSULTANT'],
  ['tuvan2', 'Lê Minh Đức', 'CONSULTANT'],
  ['giaovu', 'Trần Thị Mai', 'ACADEMIC'],
  ['lanhdao', 'Nguyễn Văn Hùng', 'DIRECTOR'],
];

// [khoá, trình độ, hình thức, khai giảng, kết thúc, GV(1-based), phòng|null, lịch, trạng thái, số ENROLLED, số WAITING]
const S = (days, shift) => days.map((w) => ({ weekday: w, shift }));
const CLASSES = [
  ['IELTS-F', 'A2', 'OFFLINE', '2026-06-01', '2026-08-30', 2, 'P.102', S([2, 4, 6], 'MORNING'), 'COMPLETED', 24, 0],
  ['TOEIC-LR', 'B1', 'ONLINE', '2026-07-01', '2026-09-15', 3, null, S([3, 5], 'EVENING'), 'COMPLETED', 14, 0],
  ['IELTS-I', 'B1', 'OFFLINE', '2026-09-07', '2026-12-20', 1, 'P.201', S([2, 4, 6], 'EVENING'), 'IN_PROGRESS', 27, 0],
  ['TOEIC-LR', 'A2', 'ONLINE', '2026-09-14', '2026-11-30', 3, null, S([3, 5], 'EVENING'), 'IN_PROGRESS', 18, 0],
  ['VSTEP-B1', 'A2', 'OFFLINE', '2026-10-05', '2026-12-28', 5, 'P.101', S([7, 8], 'MORNING'), 'IN_PROGRESS', 30, 0],
  ['IELTS-F', 'A2', 'OFFLINE', '2026-12-07', '2027-02-28', 2, 'P.102', S([2, 4, 6], 'EVENING'), 'RECRUITING', 24, 0],
  ['IELTS-F', 'B1', 'ONLINE', '2026-12-05', '2027-02-27', 6, null, S([7, 8], 'AFTERNOON'), 'RECRUITING', 8, 0],
  ['IELTS-I', 'B1', 'OFFLINE', '2026-12-14', '2027-03-14', 1, 'P.201', S([3, 5, 7], 'EVENING'), 'RECRUITING', 30, 3],
  ['IELTS-I', 'B2', 'ONLINE', '2026-12-12', '2027-03-13', 4, null, S([3, 5], 'EVENING'), 'RECRUITING', 15, 0],
  ['IELTS-A', 'B2', 'OFFLINE', '2027-01-04', '2027-03-28', 4, 'P.301', S([2, 4], 'EVENING'), 'RECRUITING', 12, 0],
  ['IELTS-A', 'C1', 'ONLINE', '2027-01-09', '2027-04-03', 7, null, S([7, 8], 'MORNING'), 'RECRUITING', 11, 0],
  ['TOEIC-LR', 'A2', 'OFFLINE', '2026-12-01', '2027-02-15', 3, 'P.202', S([2, 4, 6], 'AFTERNOON'), 'RECRUITING', 19, 0],
  ['TOEIC-LR', 'B1', 'ONLINE', '2026-12-03', '2027-02-17', 3, null, S([3, 5], 'MORNING'), 'RECRUITING', 22, 0],
  ['TOEIC-SW', 'B1', 'ONLINE', '2026-12-10', '2027-01-31', 8, null, S([2, 4], 'EVENING'), 'RECRUITING', 9, 0],
  ['VSTEP-B1', 'A2', 'OFFLINE', '2026-12-05', '2027-02-20', 5, 'P.101', S([7, 8], 'AFTERNOON'), 'RECRUITING', 30, 12],
  ['VSTEP-B1', 'B1', 'OFFLINE', '2026-12-19', '2027-03-06', 5, 'Hội trường A', S([3, 5], 'EVENING'), 'RECRUITING', 29, 0],
  ['VSTEP-B2', 'B1', 'ONLINE', '2026-12-15', '2027-03-01', 6, null, S([2, 4, 6], 'EVENING'), 'RECRUITING', 13, 0],
  ['VSTEP-B2', 'B2', 'OFFLINE', '2027-01-05', '2027-03-30', 8, null, S([3, 5], 'AFTERNOON'), 'RECRUITING', 21, 0],
  ['CAM-B2', 'B1', 'OFFLINE', '2027-01-10', '2027-04-25', 7, 'P.301', S([7, 8], 'AFTERNOON'), 'RECRUITING', 6, 0],
  ['CAM-B2', 'B2', 'ONLINE', '2027-01-16', '2027-05-01', 2, null, S([8], 'MORNING'), 'RECRUITING', 4, 0],
];

// Hồ sơ chưa xếp lớp để demo: [khoá, trình độ thi, hình thức, ca, trạng thái]
const LOOSE = [
  ['IELTS-I', 'B1', 'OFFLINE', 'EVENING', 'TESTED'], ['IELTS-I', 'B1', 'OFFLINE', 'EVENING', 'TESTED'],
  ['VSTEP-B1', 'B1', 'OFFLINE', 'EVENING', 'TESTED'], ['VSTEP-B1', 'B1', 'OFFLINE', 'EVENING', 'TESTED'], ['VSTEP-B1', 'B1', 'OFFLINE', 'EVENING', 'TESTED'],
  ['TOEIC-LR', 'A2', 'OFFLINE', 'AFTERNOON', 'TESTED'], ['TOEIC-SW', 'B1', 'ONLINE', 'EVENING', 'TESTED'],
  ['IELTS-F', 'B1', 'ONLINE', 'AFTERNOON', 'TESTED'], ['IELTS-A', 'C1', 'ONLINE', 'MORNING', 'TESTED'],
  ['CAM-B2', 'B1', 'OFFLINE', 'AFTERNOON', 'TESTED'],
  ['IELTS-I', null, 'ONLINE', 'EVENING', 'PAID'], ['TOEIC-LR', null, 'ONLINE', 'MORNING', 'PAID'], ['VSTEP-B2', null, 'OFFLINE', 'AFTERNOON', 'PAID'],
  ['IELTS-F', null, 'OFFLINE', 'EVENING', 'PAID'], ['CAM-B2', null, 'ONLINE', 'MORNING', 'PAID'],
  ['IELTS-I', null, 'OFFLINE', 'EVENING', 'PENDING_PAYMENT'], ['TOEIC-LR', null, 'ONLINE', 'MORNING', 'PENDING_PAYMENT'],
  ['VSTEP-B1', null, 'OFFLINE', 'AFTERNOON', 'PENDING_PAYMENT'], ['IELTS-A', null, 'ONLINE', 'MORNING', 'PENDING_PAYMENT'],
  ['TOEIC-SW', null, 'ONLINE', 'EVENING', 'PENDING_PAYMENT'], ['VSTEP-B2', null, 'ONLINE', 'EVENING', 'PENDING_PAYMENT'],
  ['CAM-B2', null, 'OFFLINE', 'AFTERNOON', 'PENDING_PAYMENT'], ['IELTS-F', null, 'ONLINE', 'AFTERNOON', 'PENDING_PAYMENT'],
  ['TOEIC-LR', null, 'OFFLINE', 'AFTERNOON', 'CANCELLED'], ['IELTS-I', null, 'ONLINE', 'EVENING', 'CANCELLED'], ['VSTEP-B1', null, 'OFFLINE', 'MORNING', 'CANCELLED'],
];

// Học viên demo có thông tin cố định (dùng để thử tra cứu hồ sơ)
const DEMO = [
  { name: 'Nguyễn Văn An', phone: '0912345678', email: 'an.nguyenvan@example.com', course: 'IELTS-I', form: 'OFFLINE', shift: 'EVENING', status: 'PENDING_PAYMENT' },
  { name: 'Trần Thị Bình', phone: '0987654321', email: 'binh.tranthi@example.com', course: 'TOEIC-LR', form: 'ONLINE', shift: 'MORNING', status: 'PAID' },
  { name: 'Lê Hoàng Cường', phone: '0905123456', email: 'cuong.lehoang@example.com', course: 'VSTEP-B1', form: 'OFFLINE', shift: 'EVENING', status: 'TESTED', level: 'B1' },
];

const CHATS = [
  { name: 'Hoàng Minh Tú', contact: '0934 556 778', topic: 'Lộ trình IELTS 6.5', consultant: 1, status: 'CLOSED', daysAgo: 6, msgs: [
    ['STUDENT', 'Chào trung tâm, em đang 5.0 IELTS, muốn lên 6.5 trong 3 tháng thì nên học lớp nào ạ?'],
    ['CONSULTANT', 'Chào Tú! Với band 5.0 bạn phù hợp khoá IELTS Intermediate (mục tiêu 6.0 – 6.5), 72 giờ trong 12 tuần.'],
    ['CONSULTANT', 'Sau khi đăng ký và nộp học phí, bạn làm bài kiểm tra đầu vào online để trung tâm xếp đúng lớp trình độ nhé.'],
    ['STUDENT', 'Lớp tối 3-5-7 ở cơ sở Tạ Quang Bửu còn chỗ không ạ?'],
    ['CONSULTANT', 'Lớp đó hiện đã đủ 30 học viên, các hồ sơ mới sẽ được Lãnh đạo trung tâm xem xét mở thêm lớp. Bạn cũng có thể chọn lớp online tối 3-5.'],
    ['STUDENT', 'Dạ em cảm ơn, em sẽ đăng ký luôn ạ.'],
  ] },
  { name: 'Đặng Thu Hà', contact: 'ha.dang@example.com', topic: 'Chuẩn đầu ra VSTEP', consultant: 2, status: 'CLOSED', daysAgo: 3, msgs: [
    ['STUDENT', 'Trường em yêu cầu chuẩn đầu ra B1, học VSTEP ở trung tâm mất bao lâu ạ?'],
    ['CONSULTANT', 'Khoá VSTEP Bậc 3 gồm 45 giờ (khoảng 8 tuần). Học phí 3.900.000đ, có lớp offline cuối tuần và lớp tối.'],
    ['STUDENT', 'Lớp offline cần bao nhiêu bạn mới mở ạ?'],
    ['CONSULTANT', 'Lớp offline mở khi đủ 20 học viên, tối đa 30 học viên/lớp. Lớp online chỉ cần từ 10 học viên.'],
  ] },
  { name: 'Bùi Gia Bảo', contact: '0977 123 909', topic: 'Học phí TOEIC', consultant: 1, status: 'CLOSED', daysAgo: 1, msgs: [
    ['STUDENT', 'Cho em hỏi thanh toán học phí bằng MoMo được không ạ?'],
    ['CONSULTANT', 'Được bạn nhé. Sau khi đăng ký, bạn vào mục Tra cứu hồ sơ và chọn VNPay, MoMo hoặc chuyển khoản.'],
  ] },
  { name: 'Phan Khánh Linh', contact: '0868 202 303', topic: 'Lớp Cambridge B2', consultant: null, status: 'WAITING', daysAgo: 0, msgs: [
    ['STUDENT', 'Em chào anh/chị, lớp Cambridge B2 First online học vào Chủ nhật đúng không ạ?'],
  ] },
];

// ---------------------------------------------------------------- seed
function seed() {
  const d = db.get();
  const today = new Date();
  const ids = {};

  db.tx(() => {
    // Nhân viên (mật khẩu demo: 123456)
    const insStaff = d.prepare('INSERT INTO staff_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
    STAFF.forEach(([u, n, r]) => insStaff.run(u, hashPassword('123456'), n, r));

    const insCourse = d.prepare('INSERT INTO courses (code, name, certificate, target, description, outcomes, syllabus, total_hours, tuition_fee) VALUES (?,?,?,?,?,?,?,?,?)');
    ids.course = {};
    ids.fee = {};
    for (const c of COURSES) {
      ids.course[c.code] = Number(insCourse.run(c.code, c.name, c.certificate, c.target, c.description, c.outcomes.join('\n'),
        JSON.stringify(c.syllabus.map(([phase, content]) => ({ phase, content }))), c.hours, c.fee).lastInsertRowid);
      ids.fee[c.code] = c.fee;
    }

    const insT = d.prepare('INSERT INTO teachers (full_name, title, specialty, email) VALUES (?,?,?,?)');
    TEACHERS.forEach(([n, t, s]) => insT.run(n, t, s, `${slug(n.replace(/^(ThS\.|TS\.|Mr\.|Ms\.)\s*/, ''))}@trungtam.edu.vn`));
    const insR = d.prepare('INSERT INTO rooms (name, campus, capacity) VALUES (?,?,?)');
    ids.room = {};
    ROOMS.forEach(([n, c, cap]) => { ids.room[n] = Number(insR.run(n, c, cap).lastInsertRowid); });

    const insQ = d.prepare('INSERT INTO placement_questions (difficulty, skill, content, options, answer_index) VALUES (?,?,?,?,?)');
    QUESTIONS.forEach(([lv, sk, q, opts, a]) => insQ.run(lv, sk, q, JSON.stringify(opts), a));

    // Lớp học
    const insC = d.prepare(`INSERT INTO classes (code, course_id, level, form, start_date, end_date, teacher_id, room_id, meeting_link, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const insS = d.prepare('INSERT INTO class_schedules (class_id, weekday, shift) VALUES (?,?,?)');
    const counter = {};
    const classRows = CLASSES.map(([course, level, form, start, end, t, room, slots, status, nEnr, nWait]) => {
      const prefix = `${course}-${level}-${form === 'ONLINE' ? 'ON' : 'OFF'}-`;
      counter[prefix] = (counter[prefix] || 0) + 1;
      const code = `${prefix}${pad(counter[prefix])}`;
      const created = fmt(addDays(new Date(start), -75));
      const id = Number(insC.run(code, ids.course[course], level, form, start, end, t, room ? ids.room[room] : null,
        form === 'ONLINE' ? `https://meet.trungtam.edu.vn/${code.toLowerCase()}` : null, status, created).lastInsertRowid);
      slots.forEach((s) => insS.run(id, s.weekday, s.shift));
      return { id, code, course, level, form, start, slots, status, nEnr, nWait };
    });

    // Sinh hồ sơ (chưa gán mã) rồi sắp theo thời gian tạo để mã DK tăng dần theo thời gian
    const regs = [];
    const usedNames = new Set();
    let phoneSeq = 0;
    const newStudent = () => {
      let name;
      do { name = `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`; } while (usedNames.has(name));
      usedNames.add(name);
      phoneSeq++;
      return {
        name,
        phone: `0${pick(['3', '5', '7', '8', '9'])}${pick(['2', '4', '6', '8'])}${String(1000000 + phoneSeq * 7919).slice(-7)}`,
        email: `${slug(name)}${phoneSeq}@gmail.com`,
        dob: `${between(1996, 2008)}-${pad(between(1, 12))}-${pad(between(1, 28))}`,
      };
    };
    const created = (startStr, minBefore, maxBefore) => {
      let dt = addDays(new Date(startStr), -between(minBefore, maxBefore));
      if (dt > addDays(today, -7)) dt = addDays(today, -between(7, 25));
      return atHour(dt);
    };
    for (const c of classRows) {
            for (let i = 0; i < c.nEnr; i++) {
        regs.push({ student: newStudent(), course: c.course, form: c.form, shift: c.slots[0].shift, status: 'ENROLLED', classId: c.id, level: c.level,
          desiredClassId: rand() < 0.5 ? c.id : null, createdAt: created(c.start, 20, 95) });
      }
      for (let i = 0; i < c.nWait; i++) {
        regs.push({ student: newStudent(), course: c.course, form: c.form, shift: c.slots[0].shift, status: 'WAITING_APPROVAL', classId: c.id, level: c.level,
          desiredClassId: c.id, createdAt: atHour(addDays(today, -between(2, 12))) });
      }
    }
    for (const [course, level, form, shift, status] of LOOSE) {
      regs.push({ student: newStudent(), course, form, shift, status, classId: null, level, createdAt: atHour(addDays(today, -between(1, 20))) });
    }
    DEMO.forEach((x, i) => regs.push({ student: { name: x.name, phone: x.phone, email: x.email, dob: '2005-05-20' }, course: x.course, form: x.form, shift: x.shift,
      status: x.status, classId: null, level: x.level || null, createdAt: atHour(addDays(today, -(3 - i))) }));
    regs.sort((a, b) => a.createdAt - b.createdAt);

    const insStu = d.prepare('INSERT INTO students (full_name, dob, phone, email, created_at) VALUES (?,?,?,?,?)');
    const insReg = d.prepare(`INSERT INTO registrations (reg_code, student_id, course_id, desired_form, desired_shift, desired_class_id, class_id, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insPay = d.prepare('INSERT INTO payments (registration_id, amount, method, txn_code, collected_by, paid_at) VALUES (?,?,?,?,?,?)');
    const insAtt = d.prepare('INSERT INTO placement_attempts (registration_id, question_ids, answers, score, total, level, started_at, submitted_at) VALUES (?,?,?,?,?,?,?,?)');
    const qIds = d.prepare('SELECT question_id FROM placement_questions ORDER BY question_id LIMIT 20').all().map((r) => r.question_id);
    const scoreFor = { A1: [2, 5], A2: [6, 9], B1: [10, 13], B2: [14, 16], C1: [17, 20] };
    const methods = ['VNPAY', 'VNPAY', 'MOMO', 'MOMO', 'BANK', 'BANK', 'CASH'];
    const demoCodes = [];

    regs.forEach((r, i) => {
      const code = `DK-${r.createdAt.getFullYear()}-${String(i + 1).padStart(4, '0')}`;
      const sid = Number(insStu.run(r.student.name, r.student.dob, r.student.phone, r.student.email, fmt(r.createdAt)).lastInsertRowid);
      const paidAt = atHour(addDays(r.createdAt, between(0, 2)));
      const testedAt = atHour(addDays(paidAt, between(0, 2)));
      const updated = r.status === 'PENDING_PAYMENT' || r.status === 'CANCELLED' ? r.createdAt : (r.level ? testedAt : paidAt);
      const rid = Number(insReg.run(code, sid, ids.course[r.course], r.form, r.shift, r.desiredClassId || null, r.classId, r.status,
        fmt(r.createdAt), fmt(updated > today ? today : updated)).lastInsertRowid);
      if (!['PENDING_PAYMENT', 'CANCELLED'].includes(r.status)) {
        const m = pick(methods);
        insPay.run(rid, ids.fee[r.course], m, `${m}-SEED${String(rid).padStart(5, '0')}`, m === 'CASH' ? 3 : null, fmt(paidAt > today ? today : paidAt));
      }
      if (r.level && r.status !== 'PAID') {
        const [lo, hi] = scoreFor[r.level];
        const t = testedAt > today ? today : testedAt;
        insAtt.run(rid, JSON.stringify(qIds), '{}', between(lo, hi), 20, r.level, fmt(addDays(t, -0.01)), fmt(t));
      }
      if (DEMO.some((x) => x.phone === r.student.phone)) demoCodes.push({ code, name: r.student.name, phone: r.student.phone, status: r.status });
    });
    ids.demoCodes = demoCodes;

    // Tờ trình: đang chờ cho các lớp có hồ sơ WAITING + 1 tờ trình lịch sử đã xử lý
    const insReq = d.prepare('INSERT INTO approval_requests (class_id, reason, proposed_action, status, decision, decision_note, decided_by, created_at, decided_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const c of classRows.filter((x) => x.nWait > 0)) {
      const total = c.nEnr + c.nWait;
      insReq.run(c.id, `Lớp ${c.code} đã đủ 30 học viên, có ${c.nWait} hồ sơ đề nghị xếp thêm (tổng ${total}).`, total >= 40 ? 'SPLIT' : 'KEEP',
        'PENDING', null, null, null, fmt(atHour(addDays(today, -2))), null);
    }
    const hist = classRows.find((x) => x.code.startsWith('VSTEP-B1-A2-OFF') && x.status === 'IN_PROGRESS');
    insReq.run(hist.id, `Lớp ${hist.code} đã đủ 30 học viên, có 2 hồ sơ đề nghị xếp thêm (tổng 32).`, 'KEEP', 'REJECTED', 'REJECT',
      'Không giữ ngoại lệ do phòng P.101 đã kín lịch thi; chuyển 2 học viên sang lớp khai giảng tháng 12.', 4,
      fmt(new Date('2026-09-28T09:12:00')), fmt(new Date('2026-09-29T15:40:00')));

    // Phiên chat
    const insCS = d.prepare('INSERT INTO chat_sessions (session_id, guest_name, guest_contact, topic, consultant_id, status, started_at, accepted_at, closed_at) VALUES (?,?,?,?,?,?,?,?,?)');
    const insCM = d.prepare('INSERT INTO chat_messages (session_id, sender_type, sender_name, body, sent_at) VALUES (?,?,?,?,?)');
    CHATS.forEach((c, i) => {
      const sid = `seed-chat-000${i + 1}`;
      const t0 = new Date(today.getTime() - c.daysAgo * 86400e3 - 3600e3);
      const consultantName = c.consultant ? STAFF[c.consultant - 1][1] : null;
      insCS.run(sid, c.name, c.contact, c.topic, c.consultant, c.status, fmt(t0), c.consultant ? fmt(new Date(t0.getTime() + 60e3)) : null,
        c.status === 'CLOSED' ? fmt(new Date(t0.getTime() + (c.msgs.length + 2) * 90e3)) : null);
      let t = t0.getTime();
      c.msgs.forEach(([type, body]) => {
        t += 75e3;
        insCM.run(sid, type, type === 'STUDENT' ? c.name : consultantName, body, fmt(new Date(t)));
      });
    });
  });
  return ids;
}

function isEmpty() {
  return db.get().prepare('SELECT COUNT(*) n FROM courses').get().n === 0;
}

function seedIfEmpty() {
  if (isEmpty()) {
    const ids = seed();
    printDemo(ids.demoCodes);
  }
}

function printDemo(codes) {
  console.log('Đã nạp dữ liệu mẫu. Tài khoản nhân viên (mật khẩu 123456): tuvan1, tuvan2, giaovu, lanhdao');
  for (const c of codes) console.log(`  Hồ sơ demo ${c.code} – ${c.name} – SĐT ${c.phone} – ${c.status}`);
}

if (require.main === module) {
  // Reset hoàn toàn CSDL. Không xoá file (Windows khoá file khi máy chủ đang chạy) mà DROP toàn bộ bảng rồi tạo lại.
  const d = db.open();
  d.pragma('foreign_keys = OFF');
  const objs = d.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('view','table') AND name NOT LIKE 'sqlite_%'").all();
  d.transaction(() => {
    for (const o of objs.filter((x) => x.type === 'view')) d.exec(`DROP VIEW IF EXISTS "${o.name}"`);
    for (const o of objs.filter((x) => x.type === 'table')) d.exec(`DROP TABLE IF EXISTS "${o.name}"`);
    d.exec("DELETE FROM sqlite_sequence WHERE 1 AND EXISTS (SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence')");
  })();
  d.pragma('foreign_keys = ON');
  d.exec(fs.readFileSync(require('path').join(__dirname, 'schema.sql'), 'utf8'));
  const ids = seed();
  const n = (t) => db.get().prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`CSDL: ${config.DB_PATH}`);
  console.log(`  courses=${n('courses')} classes=${n('classes')} students=${n('students')} registrations=${n('registrations')} payments=${n('payments')} questions=${n('placement_questions')} chat_sessions=${n('chat_sessions')}`);
  printDemo(ids.demoCodes);
  db.close();
}

module.exports = { seed, seedIfEmpty };
