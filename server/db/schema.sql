-- =====================================================================
-- Lược đồ CSDL – Hệ thống quản lý trung tâm luyện thi ngoại ngữ (Đề tài 1A)
-- Chuẩn hoá 3NF · SQLite 3 · khoá ngoại bật bằng PRAGMA foreign_keys = ON
-- =====================================================================

CREATE TABLE IF NOT EXISTS staff_users (
  user_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('CONSULTANT', 'ACADEMIC', 'DIRECTOR')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS courses (
  course_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  certificate    TEXT NOT NULL CHECK (certificate IN ('IELTS', 'TOEIC', 'VSTEP', 'CAMBRIDGE')),
  target         TEXT NOT NULL,                 -- mục tiêu đầu ra, ví dụ "6.0 – 6.5"
  description    TEXT NOT NULL,
  outcomes       TEXT NOT NULL,                 -- chuẩn đầu ra (mỗi dòng 1 ý)
  syllabus       TEXT NOT NULL,                 -- lộ trình (JSON: [{phase, content}])
  total_hours    INTEGER NOT NULL CHECK (total_hours > 0),
  tuition_fee    INTEGER NOT NULL CHECK (tuition_fee > 0),
  is_published   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS teachers (
  teacher_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      TEXT NOT NULL,
  title          TEXT NOT NULL,
  specialty      TEXT NOT NULL,
  email          TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  campus         TEXT NOT NULL,
  capacity       INTEGER NOT NULL CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS classes (
  class_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  course_id       INTEGER NOT NULL REFERENCES courses(course_id),
  level           TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  form            TEXT NOT NULL CHECK (form IN ('ONLINE', 'OFFLINE')),
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(teacher_id),
  room_id         INTEGER REFERENCES rooms(room_id),        -- chỉ lớp OFFLINE
  meeting_link    TEXT,                                     -- chỉ lớp ONLINE
  status          TEXT NOT NULL DEFAULT 'RECRUITING'
                  CHECK (status IN ('RECRUITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  parent_class_id INTEGER REFERENCES classes(class_id),     -- lớp được tách từ lớp nào
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK (end_date > start_date),
  CHECK (form = 'OFFLINE' OR room_id IS NULL)
);

CREATE TABLE IF NOT EXISTS class_schedules (
  schedule_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id       INTEGER NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 2 AND 8),   -- 8 = Chủ nhật
  shift          TEXT NOT NULL CHECK (shift IN ('MORNING', 'AFTERNOON', 'EVENING')),
  UNIQUE (class_id, weekday, shift)
);

CREATE TABLE IF NOT EXISTS students (
  student_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      TEXT NOT NULL,
  dob            TEXT,
  phone          TEXT NOT NULL UNIQUE,
  email          TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS registrations (
  registration_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_code         TEXT NOT NULL UNIQUE,
  student_id       INTEGER NOT NULL REFERENCES students(student_id),
  course_id        INTEGER NOT NULL REFERENCES courses(course_id),
  desired_form     TEXT NOT NULL CHECK (desired_form IN ('ONLINE', 'OFFLINE')),
  desired_shift    TEXT NOT NULL CHECK (desired_shift IN ('MORNING', 'AFTERNOON', 'EVENING')),
  desired_class_id INTEGER REFERENCES classes(class_id),
  class_id         INTEGER REFERENCES classes(class_id),
  status           TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                   CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'TESTED', 'WAITING_APPROVAL', 'ENROLLED', 'CANCELLED')),
  note             TEXT,
  placement_note   TEXT,                    -- lý do xếp lệch trình độ (BR-06)
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK ((status IN ('ENROLLED', 'WAITING_APPROVAL')) = (class_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id  INTEGER NOT NULL UNIQUE REFERENCES registrations(registration_id),
  amount           INTEGER NOT NULL CHECK (amount > 0),
  method           TEXT NOT NULL CHECK (method IN ('VNPAY', 'MOMO', 'BANK', 'CASH')),
  txn_code         TEXT NOT NULL UNIQUE,
  collected_by     INTEGER REFERENCES staff_users(user_id),
  paid_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS placement_questions (
  question_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  skill          TEXT NOT NULL CHECK (skill IN ('GRAMMAR', 'VOCABULARY', 'READING')),
  difficulty     INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  content        TEXT NOT NULL,
  options        TEXT NOT NULL,            -- JSON mảng 4 lựa chọn
  answer_index   INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 3)
);

CREATE TABLE IF NOT EXISTS placement_attempts (
  attempt_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id  INTEGER NOT NULL UNIQUE REFERENCES registrations(registration_id),
  question_ids     TEXT NOT NULL,          -- JSON các câu đã phát (chống đổi đề)
  answers          TEXT,
  score            INTEGER,
  total            INTEGER NOT NULL,
  level            TEXT CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  started_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  submitted_at     TEXT
);

CREATE TABLE IF NOT EXISTS approval_requests (
  request_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id         INTEGER NOT NULL REFERENCES classes(class_id),
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reason           TEXT NOT NULL,
  proposed_action  TEXT NOT NULL CHECK (proposed_action IN ('SPLIT', 'KEEP')),
  decision         TEXT CHECK (decision IN ('SPLIT', 'KEEP', 'REJECT')),
  decision_note    TEXT,
  decided_by       INTEGER REFERENCES staff_users(user_id),
  result_class_id  INTEGER REFERENCES classes(class_id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  decided_at       TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id     TEXT PRIMARY KEY,
  guest_name     TEXT NOT NULL,
  guest_contact  TEXT,
  topic          TEXT,
  consultant_id  INTEGER REFERENCES staff_users(user_id),
  status         TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'ACTIVE', 'CLOSED')),
  started_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  accepted_at    TEXT,
  closed_at      TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  sender_type    TEXT NOT NULL CHECK (sender_type IN ('STUDENT', 'CONSULTANT', 'SYSTEM')),
  sender_name    TEXT NOT NULL,
  body           TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  sent_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Ràng buộc nghiệp vụ ở mức CSDL
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_registration
  ON registrations(student_id, course_id) WHERE status <> 'CANCELLED';        -- 1 hồ sơ hiệu lực / khoá
CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_request
  ON approval_requests(class_id) WHERE status = 'PENDING';                    -- 1 tờ trình chờ / lớp

CREATE INDEX IF NOT EXISTS ix_classes_course   ON classes(course_id);
CREATE INDEX IF NOT EXISTS ix_reg_class_status ON registrations(class_id, status);
CREATE INDEX IF NOT EXISTS ix_reg_status       ON registrations(status);
CREATE INDEX IF NOT EXISTS ix_msg_session      ON chat_messages(session_id, message_id);

-- Sĩ số là giá trị tính toán (BR-07)
CREATE VIEW IF NOT EXISTS v_class_enrollment AS
SELECT c.class_id,
       (SELECT COUNT(*) FROM registrations r WHERE r.class_id = c.class_id AND r.status = 'ENROLLED')         AS enrolled,
       (SELECT COUNT(*) FROM registrations r WHERE r.class_id = c.class_id AND r.status = 'WAITING_APPROVAL') AS waiting
FROM classes c;
